"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';

const colors = [
  { name:'Orange', hex:'#ff541f', rgb:'255,84,31' }, { name:'Red', hex:'#ff3b4f', rgb:'255,59,79' },
  { name:'Pink', hex:'#f04fbd', rgb:'240,79,189' }, { name:'Purple', hex:'#9b6cff', rgb:'155,108,255' },
  { name:'Blue', hex:'#438cff', rgb:'67,140,255' }, { name:'Cyan', hex:'#20c7d9', rgb:'32,199,217' },
  { name:'Green', hex:'#39c978', rgb:'57,201,120' }, { name:'Yellow', hex:'#f2bb35', rgb:'242,187,53' },
] as const;
type Theme = typeof colors[number]['name'] | 'RGB';
const storageKey = 'ginduyah.site-theme.v1';
const validTheme = (value:string|null):Theme => value==='RGB' || colors.some(color=>color.name===value) ? value as Theme : 'Orange';
const ThemeContext = createContext<{theme:Theme;choose:(theme:Theme)=>void} | null>(null);

export function SiteThemeProvider({children}:{children:ReactNode}) {
  const [theme,setTheme]=useState<Theme>('Orange');
  useEffect(()=>{
    try {setTheme(validTheme(localStorage.getItem(storageKey)));} catch { /* Theme still works when storage is blocked. */ }
    const sync=(event:StorageEvent)=>{if(event.key===storageKey || event.key===null)setTheme(validTheme(event.newValue));};
    window.addEventListener('storage',sync);
    return ()=>window.removeEventListener('storage',sync);
  },[]);

  useEffect(()=>{
    const root=document.documentElement;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0;
    const apply=(hex:string,rgb:string)=>{
      root.style.setProperty('--orange',hex);
      root.style.setProperty('--accent-rgb',rgb);
    };
    const animate=(time:number)=>{
      const hue=(time/35)%360, lightness=.6, a=.92*Math.min(lightness,1-lightness);
      const channel=(offset:number)=>{const k=(offset+hue/30)%12;return Math.round(255*(lightness-a*Math.max(-1,Math.min(k-3,9-k,1))));};
      apply(`hsl(${hue} 92% 60%)`,`${channel(0)},${channel(8)},${channel(4)}`);
      frame=requestAnimationFrame(animate);
    };
    const update=()=>{
      cancelAnimationFrame(frame);
      if(theme!=='RGB') {const color=colors.find(color=>color.name===theme)!;apply(color.hex,color.rgb);}
      else if(reduced.matches)apply(colors[3].hex,colors[3].rgb);
      else if(document.visibilityState==='visible')frame=requestAnimationFrame(animate);
    };
    update();
    reduced.addEventListener('change',update);document.addEventListener('visibilitychange',update);
    return ()=>{cancelAnimationFrame(frame);reduced.removeEventListener('change',update);document.removeEventListener('visibilitychange',update);};
  },[theme]);

  useEffect(()=>{
    const root=document.documentElement;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    let x=window.innerWidth*.82,y=0,targetX=x,targetY=y,frame=0;
    const animate=()=>{
      x+=(targetX-x)*.16;y+=(targetY-y)*.16;
      root.style.setProperty('--glow-x',`${x}px`);root.style.setProperty('--glow-y',`${y}px`);
      frame=Math.abs(targetX-x)+Math.abs(targetY-y)>.5?requestAnimationFrame(animate):0;
    };
    const follow=(event:PointerEvent)=>{
      if(reduced.matches)return;
      targetX=event.clientX;targetY=event.clientY;
      if(!frame)frame=requestAnimationFrame(animate);
    };
    window.addEventListener('pointermove',follow,{passive:true});
    return ()=>{cancelAnimationFrame(frame);window.removeEventListener('pointermove',follow);};
  },[]);

  function choose(next:Theme) {
    setTheme(next);
    try {localStorage.setItem(storageKey,next);} catch { /* Keep the selection for this visit. */ }
  }
  return <ThemeContext.Provider value={{theme,choose}}>{children}</ThemeContext.Provider>;
}

export function ThemePicker() {
  const context=useContext(ThemeContext);
  const [open,setOpen]=useState(false);
  const wrapper=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const id=useId();
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!wrapper.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  if(!context)return null;
  const {theme,choose}=context;
  const color=colors.find(color=>color.name===theme);
  function select(next:Theme){choose(next);setOpen(false);trigger.current?.focus();}
  return <div ref={wrapper} className={`theme-menu ${open?'open':''}`} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOpen(false);}}>
    <button ref={trigger} className="theme-trigger" aria-label={`Site theme: ${theme}`} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}>
      <span className={theme==='RGB'?'theme-dot rgb-dot':'theme-dot'} style={color?{background:color.hex}:undefined}/><span>THEME</span><strong>{theme}</strong><i aria-hidden="true">⌄</i>
    </button>
    {open && <div id={id} className="theme-options" role="group" aria-label="Choose site theme">
      {colors.map(option=><button key={option.name} aria-pressed={theme===option.name} className={theme===option.name?'selected':''} onClick={()=>select(option.name)}><span className="theme-dot" style={{background:option.hex}}/><span>{option.name}</span><b aria-hidden="true">✓</b></button>)}
      <button aria-pressed={theme==='RGB'} className={theme==='RGB'?'selected':''} onClick={()=>select('RGB')}><span className="theme-dot rgb-dot"/><span>RGB <small>Animated</small></span><b aria-hidden="true">✓</b></button>
      <p className="theme-scope">All pages · saved on this device</p>
    </div>}
  </div>;
}
