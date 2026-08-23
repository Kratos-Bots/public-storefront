// Inlined into index.html by hand (copy the body between the markers). Runs before React:
// reads sf-theme-v1 and sets the same --sf-* variables applyDocumentTheme() sets, so a returning
// visitor never sees the default palette. Must stay in sync with cssVariablesFor().
export const THEME_BOOTSTRAP = `(function(){try{var raw=localStorage.getItem('sf-theme-v1');if(!raw)return;var s=JSON.parse(raw),t=s.theme,b=s.brand,c=t.colors,d=t.scheme==='dark',tt=d?'#ffffff':'#000000';
function p(h){return[1,3,5].map(function(i){return parseInt(h.slice(i,i+2),16)})}
function mix(h,w,k){var a=p(h),q=p(w);return'#'+a.map(function(x,i){return Math.round(x+(q[i]-x)*k).toString(16).padStart(2,'0')}).join('')}
var r=document.documentElement,v={'--sf-bg':c.bg,'--sf-bg-deep':mix(c.bg,d?'#000000':'#ffffff',.18),'--sf-surface':c.surface,'--sf-surface-2':mix(c.surface,tt,.07),'--sf-surface-3':mix(c.surface,tt,.14),'--sf-line':mix(c.surface,tt,.12),'--sf-line-strong':mix(c.surface,tt,.24),'--sf-text':c.text,'--sf-muted':c.muted,'--sf-faint':mix(c.muted,c.bg,.35),'--sf-primary':c.primary,'--sf-primary-soft':mix(c.primary,c.bg,.75),'--sf-success':c.success,'--sf-warn':c.warn,'--sf-danger':c.danger,'--sf-logo-h':b.logoHeight+'px'};
for(var k in v)r.style.setProperty(k,v[k]);r.setAttribute('data-mantine-color-scheme',t.scheme);r.style.colorScheme=t.scheme;if(b.title)document.title=b.title;}catch(e){}})();`;
