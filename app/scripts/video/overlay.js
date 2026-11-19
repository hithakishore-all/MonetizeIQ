/* Walkthrough overlay: caption card, highlight box, cursor and title card. Injected by record.py.
   Every id and class is prefixed fw- so it can't collide with the app's own styles. */
(function () {
  if (window.top !== window) return;
  const css = `
  #fw-cap{position:fixed;left:24px;bottom:24px;width:480px;z-index:2147483600;background:#101436;color:#fff;border-radius:14px;padding:14px 18px 16px;border-left:6px solid var(--fw-pc,#E040A0);box-shadow:0 18px 40px -12px rgba(0,0,0,.55);font:14px/1.45 'IBM Plex Sans',system-ui,sans-serif;opacity:0;transform:translateY(10px);transition:opacity .35s,transform .35s}
  #fw-cap.fw-on{opacity:1;transform:none}
  #fw-cap .fw-k{font:600 12px 'IBM Plex Mono',monospace;color:#FBBF24;letter-spacing:.02em}
  #fw-cap .fw-t{font:700 19px 'Bricolage Grotesque',system-ui,sans-serif;margin:3px 0 4px}
  #fw-cap .fw-b{color:#D6D9F0}
  #fw-hl{position:fixed;z-index:2147483500;border:3px solid #F59E0B;border-radius:12px;box-shadow:0 0 0 6px rgba(245,158,11,.22),0 0 30px rgba(245,158,11,.45);pointer-events:none;opacity:0;transition:all .55s cubic-bezier(.3,.7,.2,1)}
  #fw-hl.fw-on{opacity:1}
  #fw-hl .fw-lab{position:absolute;left:-3px;top:-30px;background:#F59E0B;color:#1A1300;font:700 12px 'IBM Plex Mono',monospace;padding:4px 9px;border-radius:7px 7px 7px 0;white-space:nowrap}
  #fw-hl.fw-below .fw-lab{top:auto;bottom:-30px;border-radius:0 7px 7px 7px}
  #fw-cur{position:fixed;z-index:2147483646;width:26px;height:26px;left:640px;top:400px;pointer-events:none;transition:left .75s cubic-bezier(.3,.7,.2,1),top .75s cubic-bezier(.3,.7,.2,1);filter:drop-shadow(0 3px 4px rgba(0,0,0,.45))}
  .fw-rip{position:fixed;z-index:2147483645;width:16px;height:16px;border-radius:50%;border:3px solid #F59E0B;pointer-events:none;animation:fw-r .6s ease-out forwards}
  @keyframes fw-r{from{transform:translate(-50%,-50%) scale(.4);opacity:1}to{transform:translate(-50%,-50%) scale(3.2);opacity:0}}
  #fw-card{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;color:#fff;text-align:center;opacity:0;pointer-events:none;transition:opacity .5s;
    background:radial-gradient(120% 140% at 0% 0%,#FF5E5B 0%,transparent 45%),radial-gradient(90% 120% at 35% 120%,#E040A0 0%,transparent 55%),radial-gradient(90% 140% at 75% -20%,#7C3AED 0%,transparent 55%),radial-gradient(80% 140% at 110% 60%,#06B6D4 0%,transparent 55%),#3B1C8C}
  #fw-card.fw-on{opacity:1}
  #fw-card .fw-in{max-width:820px;padding:0 40px}
  #fw-card .fw-logo{font:800 64px 'Bricolage Grotesque',system-ui,sans-serif;letter-spacing:-.02em}
  #fw-card .fw-tag{font:600 24px 'Bricolage Grotesque',system-ui,sans-serif;margin-top:6px;opacity:.95}
  #fw-card .fw-line{font:17px/1.5 'IBM Plex Sans',system-ui,sans-serif;margin-top:22px;opacity:.95}
  #fw-card .fw-small{font:13px 'IBM Plex Mono',monospace;margin-top:28px;opacity:.8}`;
  function boot() {
    if (document.getElementById('fw-cap')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const cap = document.createElement('div'); cap.id = 'fw-cap'; cap.innerHTML = '<div class="fw-k"></div><div class="fw-t"></div><div class="fw-b"></div>';
    const hl = document.createElement('div'); hl.id = 'fw-hl'; hl.innerHTML = '<span class="fw-lab"></span>';
    const cur = document.createElement('div'); cur.id = 'fw-cur';
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.6 L11 13.4 L18 13.4 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const card = document.createElement('div'); card.id = 'fw-card'; card.innerHTML = '<div class="fw-in"><div class="fw-logo"></div><div class="fw-tag"></div><div class="fw-line"></div><div class="fw-small"></div></div>';
    document.body.append(hl, cap, cur, card);
    try {
      const c = JSON.parse(localStorage.getItem('fw-cap') || 'null'); if (c) api.cap(c.k, c.t, c.b, c.pc, true);
      const p = JSON.parse(localStorage.getItem('fw-cur') || 'null'); if (p) { cur.style.transition = 'none'; cur.style.left = p.x + 'px'; cur.style.top = p.y + 'px'; requestAnimationFrame(() => { cur.style.transition = ''; }); }
    } catch (e) {}
  }
  const $ = id => document.getElementById(id);
  const api = {
    cap(k, t, b, pc, instant) {
      const el = $('fw-cap'); if (!el) return;
      const set = () => { el.style.setProperty('--fw-pc', pc || '#E040A0'); el.querySelector('.fw-k').textContent = k; el.querySelector('.fw-t').textContent = t; el.querySelector('.fw-b').textContent = b; el.classList.add('fw-on'); };
      if (instant || !el.classList.contains('fw-on')) set(); else { el.classList.remove('fw-on'); setTimeout(set, 250); }
      try { localStorage.setItem('fw-cap', JSON.stringify({ k, t, b, pc })); } catch (e) {}
    },
    nocap() { const el = $('fw-cap'); if (el) el.classList.remove('fw-on'); try { localStorage.removeItem('fw-cap'); } catch (e) {} },
    cur(x, y) { const c = $('fw-cur'); if (!c) return; c.style.left = x + 'px'; c.style.top = y + 'px'; try { localStorage.setItem('fw-cur', JSON.stringify({ x, y })); } catch (e) {} },
    ripple(x, y) { const r = document.createElement('div'); r.className = 'fw-rip'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); },
    hl(x, y, w, h, label) {
      const el = $('fw-hl'); if (!el) return;
      Object.assign(el.style, { left: (x - 6) + 'px', top: (y - 6) + 'px', width: (w + 12) + 'px', height: (h + 12) + 'px' });
      el.classList.toggle('fw-below', y < 50); el.querySelector('.fw-lab').textContent = label || ''; el.classList.add('fw-on');
    },
    nohl() { const el = $('fw-hl'); if (el) el.classList.remove('fw-on'); },
    card(logo, tag, line, small) {
      const el = $('fw-card'); el.querySelector('.fw-logo').textContent = logo; el.querySelector('.fw-tag').textContent = tag;
      el.querySelector('.fw-line').textContent = line; el.querySelector('.fw-small').textContent = small; el.classList.add('fw-on'); $('fw-cur').style.opacity = 0;
    },
    nocard() { $('fw-card').classList.remove('fw-on'); $('fw-cur').style.opacity = 1; }
  };
  window.__fw = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
