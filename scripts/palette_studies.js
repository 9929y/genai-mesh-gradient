/* Portable palette/layout studies. No connection or Figma writes on load. */
(function (root) {
  'use strict';
  const palettes = {
    mono: {name:'Monochromatic', colors:['#fff4e7','#fddaaa','#f6ad71','#b7542e'], advice:'Monochromatic: use tonal separation for coherent covers and section backgrounds. Similar midtones can flatten the composition.'},
    adjacent: {name:'Analogous warm', colors:['#fff4e7','#e6be6c','#f6ad71','#c97c83'], advice:'Analogous warm: let gold, apricot or rose lead. Keep the other colors subordinate.'},
    contrast: {name:'Apricot × cobalt', colors:['#f8f1e8','#f4b78b','#7398d1','#3e64ac'], advice:'Apricot × cobalt: warm white and apricot set the atmosphere; blue supplies structure. Compare coverage and negative space; reduce overlap if it turns gray.'},
    neutral: {name:'Neutral + accent', colors:['#f4f5f3','#d5dede','#91a9b4','#3f708e'], advice:'Neutral + accent: suitable for content-heavy pages. Keep a blue anchor to preserve visual identity.'}
  };
  // CSS background order is front to back. Positions/stops match the guide.
  const pools = [[1,.18,.28,.60],[2,.78,.28,.62],[3,.65,.95,.50],[2,.25,.88,.60]];
  // Round emitted numbers to 3 decimals: no visible change, far shorter markup.
  const n3 = v => +v.toFixed(3);
  function colorsValid(colors) {
    if (!Array.isArray(colors)||colors.length!==4||colors.some(c=>!/^#[0-9a-f]{6}$/i.test(c))) throw new Error('Supply four #RRGGBB role colors');
    return colors;
  }
  function paletteColors(key) {
    if (!Object.prototype.hasOwnProperty.call(palettes, key)) throw new Error(`Unknown palette "${key}"; use ${Object.keys(palettes).join(', ')}`);
    return colorsValid(palettes[key].colors);
  }
  function paletteCSS(colors) {
    const c=colorsValid(colors);
    return pools.map(([k,x,y,end])=>`radial-gradient(ellipse at ${n3(x*100)}% ${n3(y*100)}%,${c[k]} 0%,transparent ${n3(end*100)}%)`).join(',')+','+c[0];
  }
  function paletteSVG(key, width=1200, height=600) {
    const c=paletteColors(key);
    if (![width,height].every(n=>Number.isFinite(n)&&n>0&&n<=16384)) throw new Error('Invalid size');
    const defs=pools.map(([k,x,y,end],i)=>{
      const rx=Math.SQRT2*Math.max(x,1-x)*width;
      const ry=Math.SQRT2*Math.max(y,1-y)*height;
      return `<radialGradient id="pool${i}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(${n3(x*width)} ${n3(y*height)}) scale(${n3(rx)} ${n3(ry)})"><stop stop-color="${c[k]}"/><stop offset="${end}" stop-color="${c[k]}" stop-opacity="0"/></radialGradient>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${key} / fixed four-pool palette study</title><defs>${defs}</defs><rect width="100%" height="100%" fill="${c[0]}"/>`+pools.map((_,i)=>i).reverse().map(i=>`<rect width="100%" height="100%" fill="url(#pool${i})"/>`).join('')+'</svg>';
  }
  function layoutSpec(width, height, key='contrast') {
    if (![width,height].every(n=>Number.isFinite(n)&&n>0&&n<=16384)) throw new Error('Invalid canvas size');
    const c=paletteColors(key), short=Math.min(width,height), ratio=width/height;
    let layout, quietZone, regions;
    // [color index, normalized center, short-side support half-extents, angle, alpha]
    if (ratio>=1.35) {
      layout='wide'; quietZone={x:.06,y:.17,width:.33,height:.55};
      regions=[[1,.74,.24,1.15,.92,-18,.93],[2,.94,.80,1.0,.86,15,.96],[3,.59,1.02,.9,.68,-28,.92],[2,.53,.80,.82,.48,-32,.8]];
    } else if (ratio<=.8) {
      layout='portrait'; quietZone={x:.09,y:.055,width:.82,height:.24};
      regions=[[1,.32,.58,1.2,1.0,-30,.96],[2,.91,.73,1.1,1.25,25,.96],[3,.35,.99,1.1,.8,-15,.93],[2,.91,.43,.8,.9,18,.72]];
    } else {
      layout='square'; quietZone={x:.08,y:.08,width:.60,height:.25};
      regions=[[1,.30,.70,1.2,.85,-26,.94],[2,.93,.49,1.0,1.0,20,.94],[3,.84,.99,1.05,.8,-18,.90],[2,.15,.98,.9,.7,15,.72]];
    }
    return {name:`Palette / ${key} / ${layout}`,width,height,base:c[0],layout,quietZone,
      regions:regions.map(([k,x,y,rx,ry,angle,alpha])=>({color:c[k],x,y,rx:rx*short/width,ry:ry*short/height,angle,alpha}))};
  }
  function layoutSVG(spec, showQuiet=true) {
    const {width:w,height:h,regions,quietZone:q}=spec;
    const prefix=`layout-${w}-${h}-`;
    const defs=regions.map((r,i)=>`<radialGradient id="${prefix}mass${i}">`+Array.from({length:49},(_,k)=>`<stop offset="${n3(k/48)}" stop-color="${r.color}" stop-opacity="${k===48?0:n3(Math.exp(-8*(k/48)**2)*r.alpha)}"/>`).join('')+'</radialGradient>').join('');
    const masses=regions.map((r,i)=>`<ellipse cx="0" cy="0" rx="${n3(r.rx*w)}" ry="${n3(r.ry*h)}" transform="translate(${n3(r.x*w)} ${n3(r.y*h)}) rotate(${n3(r.angle)})" fill="url(#${prefix}mass${i})"/>`).join('');
    const quiet=showQuiet?`<rect x="${n3(q.x*w)}" y="${n3(q.y*h)}" width="${n3(q.width*w)}" height="${n3(q.height*h)}" rx="${n3(.008*Math.min(w,h))}" fill="white" fill-opacity=".38" stroke="#60472e" stroke-opacity=".6" stroke-width="${n3(Math.min(w,h)*.002)}" stroke-dasharray="${n3(Math.min(w,h)*.01)} ${n3(Math.min(w,h)*.008)}"/><text x="${n3((q.x+.025)*w)}" y="${n3((q.y+.04)*h)}" fill="#493d33" font-family="sans-serif" font-size="${n3(Math.min(w,h)*.022)}">TITLE ZONE</text>`:'';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${spec.layout} recomposed palette study"><defs>${defs}</defs><rect width="100%" height="100%" fill="${spec.base}"/>${masses}${quiet}</svg>`;
  }
  const api={palettes,pools,paletteCSS,paletteSVG,layoutSpec,layoutSVG};
  root.MeshGradientStudies=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(globalThis);
