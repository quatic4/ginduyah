export const MAX_IMAGE = 10 * 1024 * 1024;
const BUCKET = 'studio-screenshots';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-studio-session, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'private, no-store' };
export class FileError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function imageMime(bytes: Uint8Array) {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  const text = new TextDecoder();
  if (bytes.length >= 12 && text.decode(bytes.slice(0,4)) === 'RIFF' && text.decode(bytes.slice(8,12)) === 'WEBP') return 'image/webp';
  throw new FileError('Use a PNG, JPG or WebP screenshot. Export HEIC images as JPG first.');
}
export function safeFilename(name: string, mime: string) {
  const stem = name.replace(/\.[^.]+$/, '').replace(/[\x00-\x1f\x7f/\\<>:"|?*]/g, '_').trim().slice(0,150) || 'screenshot';
  return stem + (mime === 'image/png' ? '.png' : mime === 'image/jpeg' ? '.jpg' : '.webp');
}
// Small structural interface keeps the handler testable without live credentials.
type Result = { data: any; error: any };
type Client = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Result>; storage: { getBucket: (id: string) => Promise<Result>; createBucket: (id: string, options: Record<string, unknown>) => Promise<Result>; from: (id: string) => any } };
export function createFileHandler(admin: Client) {
  async function call(token: string, actor: string | null, action: string, payload: Record<string, unknown>) {
    const { data, error } = await admin.rpc('studio_files', { access_token: token, actor_id: actor, action, payload });
    if (error) {
      if (error.code === '28000') throw new FileError('Your session ended. Enter the team PIN again.', 401);
      throw new FileError(error.code === '22P02' ? 'Check the submission, dates and selected name.' : error.message || 'Could not save this screenshot.');
    }
    return data;
  }
  async function bucket() {
    let result = await admin.storage.getBucket(BUCKET);
    if (result.error) {
      const created = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_IMAGE, allowedMimeTypes: ['image/png','image/jpeg','image/webp'] });
      if (created.error) result = await admin.storage.getBucket(BUCKET); else result = created;
    }
    if (result.error) throw new FileError('Screenshot storage is temporarily unavailable. Please retry.', 503);
    if (result.data?.public) throw new FileError('Screenshot storage needs its privacy setting fixed.', 503);
    return admin.storage.from(BUCKET);
  }
  async function body(req: Request, limit: number) {
    const reader = req.body?.getReader(); if (!reader) throw new FileError('Choose a screenshot.');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const r = await reader.read(); if (r.done) break; size += r.value.byteLength; if (size > limit) { await reader.cancel(); throw new FileError('Each screenshot must be 10 MB or smaller.', 413); } chunks.push(r.value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
    return bytes;
  }
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return reply({ error: 'Use POST.' },405);
    const token = req.headers.get('x-studio-session') || '';
    try {
      if (!/^[a-f0-9]{64}$/.test(token)) throw new FileError('Enter the team PIN to open screenshots.',401);
      await call(token,null,'authorize',{});
      const multipart = (req.headers.get('content-type') || '').startsWith('multipart/form-data');
      if (multipart) {
        const bytes = await body(req,MAX_IMAGE+65536);
        const form = await new Response(bytes,{headers:{'Content-Type':req.headers.get('content-type')!}}).formData();
        const file = form.get('file');
        if (!(file instanceof File) || !file.size || file.size > MAX_IMAGE) throw new FileError('Choose a screenshot of 10 MB or smaller.',413);
        const image = new Uint8Array(await file.arrayBuffer()); const mime = imageMime(image);
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',image))).map(b=>b.toString(16).padStart(2,'0')).join('');
        const actor = String(form.get('actor_id') || '');
        const reserved = await call(token,actor,'reserve',{ id:form.get('id'), item_id:form.get('item_id'), channel_id:form.get('channel_id'), start_date:form.get('start_date'), title:form.get('title'), file_name:safeFilename(file.name,mime), mime_type:mime, byte_size:file.size, sha256 });
        if (reserved.state === 'ready') return reply({ attachment:reserved });
        const storage = await bucket();
        const uploaded = await storage.upload(reserved.object_path,image,{contentType:mime,upsert:false,cacheControl:'60'});
        // A prior timed-out request may have stored these exact immutable bytes.
        if (uploaded.error && !['409','400'].includes(String(uploaded.error.statusCode))) throw new FileError('Upload did not finish. Retry this file; its date and submission are reserved.',503);
        if (uploaded.error) {
          const existing = await storage.download(reserved.object_path);
          if (existing.error) throw new FileError('Upload did not finish. Retry this file.',503);
          const storedHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await existing.data.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
          if (storedHash !== sha256) throw new FileError('Stored file does not match this screenshot. Remove the incomplete attachment before trying again.',409);
        }
        return reply({attachment:await call(token,actor,'complete',{id:reserved.id})});
      }
      const bytes = await body(req,16384); const data = JSON.parse(new TextDecoder().decode(bytes));
      if (data.action === 'list' || data.action === 'download') {
        const files = await call(token,null,'list',{item_id:data.item_id});
        const storage = admin.storage.from(BUCKET);
        if (data.action === 'download') {
          const file = files.find((f:any)=>f.id===data.id && f.state==='ready');
          if (!file) throw new FileError('Screenshot is not ready or was removed.',404);
          const signed = await storage.createSignedUrl(file.object_path,60,{download:file.file_name});
          if (signed.error) throw new FileError('Could not open the original screenshot. Refresh and try again.',503);
          return reply({url:signed.data.signedUrl});
        }
        return reply({attachments:await Promise.all(files.map(async (file:any)=>{
          if (file.state !== 'ready') return file;
          const signed = await storage.createSignedUrl(file.object_path,300);
          return {...file,preview_url:signed.error ? null : signed.data.signedUrl};
        }))});
      }
      if (data.action === 'remove') {
        const file = await call(token,data.actor_id,'remove',{id:data.id});
        const removed = await admin.storage.from(BUCKET).remove([file.object_path]);
        if (removed.error) throw new FileError('Could not remove the stored screenshot. Please retry.',503);
        await call(token,data.actor_id,'removed',{id:data.id}); return reply({ok:true});
      }
      throw new FileError('Unknown screenshot action.');
    } catch (error) {
      return reply({error:error instanceof FileError ? error.message : 'The screenshot request failed. Refresh to check whether it saved, then retry.'},error instanceof FileError ? error.status : 500);
    }
  };
}
