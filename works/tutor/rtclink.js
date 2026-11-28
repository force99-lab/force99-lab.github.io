/* 端到端直连（WebRTC DataChannel）：老师和学生的白板数据不再绕公共中继，
   同城/同一网络时延迟从 ~200ms 降到 ~20ms，书写跟手、PDF 大图也能秒同步。
   握手（SDP/ICE）仍走原来的中继，只占几 KB；连不上就自动退回中继，不改变原有行为。 */
(() => {
  const ICE = [
    { urls: 'stun:stun.qq.com:3478' },
    { urls: 'stun:stun.miwifi.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ];
  const BIG = 8000;        // 单条超过 8KB 就分片
  const RETRY_GAP = 2600;  // 重试间隔
  const TRIES = 25;        // 最多试 25 次（约 1 分钟），之后老实走中继

  window.RTCLink = {
    supported: !!(window.RTCPeerConnection && window.RTCDataChannel),
    create(opts) {
      const role = opts.role;
      const st = { pc: null, ctl: null, ink: null, sid: null, tries: 0, tryAt: 0, ice: [], remoteSet: false, ready: false };
      const partBuf = new Map();

      function drop() {
        st.ready = false; st.remoteSet = false; st.ice = [];
        try { if (st.ctl) { st.ctl.onmessage = null; st.ctl.onopen = null; } } catch (_) {}
        try { if (st.ink) { st.ink.onmessage = null; st.ink.onopen = null; } } catch (_) {}
        try { if (st.pc) st.pc.close(); } catch (_) {}
        st.pc = null; st.ctl = null; st.ink = null; st.sid = null;
      }

      function wire(ch) {
        ch.binaryType = 'arraybuffer';
        ch.onmessage = (ev) => {
          const s = ev.data;
          if (typeof s !== 'string') return;
          let m = null;
          try { m = JSON.parse(s); } catch (_) { return; }
          if (m && m.__cc) {
            let e = partBuf.get(m.__cc);
            if (!e) { e = { n: m.n, parts: new Array(m.n) }; partBuf.set(m.__cc, e); }
            e.parts[m.i] = m.s;
            let got = 0;
            for (let i = 0; i < e.n; i++) if (e.parts[i] != null) got++;
            if (got === e.n) {
              partBuf.delete(m.__cc);
              try { if (opts.onStream) opts.onStream(JSON.parse(e.parts.join(''))); } catch (_) {}
            }
            return;
          }
          if (opts.onStream) opts.onStream(m);
        };
      }

      function checkOpen() {
        const c = st.ctl, i = st.ink;
        if (c && c.readyState === 'open' && (!i || i.readyState === 'open')) {
          if (!st.ready) {
            st.ready = true;
            if (opts.onOpen) opts.onOpen();
          }
        }
      }

      function addIce(c) {
        if (!c || !st.pc) return;
        if (!st.remoteSet) { st.ice.push(c); return; }
        try { st.pc.addIceCandidate({ candidate: c, sdpMid: '0', sdpMLineIndex: 0 }).catch(() => {}); } catch (_) {}
      }

      function flushIce() {
        const list = st.ice; st.ice = [];
        list.forEach(addIce);
      }

      function mk() {
        drop();
        const pc = new RTCPeerConnection({ iceServers: ICE });
        st.pc = pc;
        pc.onicecandidate = (e) => {
          if (e.candidate && st.sid) {
            try { opts.signal({ t: '__rtc', k: 'ice', sid: st.sid, c: e.candidate.candidate }); } catch (_) {}
          }
        };
        pc.onconnectionstatechange = () => {
          if (st.pc !== pc) return;
          const s = pc.connectionState;
          if (s === 'failed' || s === 'closed') drop();
        };
        return pc;
      }

      function teacherOffer() {
        if (role !== 'teacher') return;
        if (!opts.hasPeer || !opts.hasPeer()) return;
        if (st.ready) return;
        if (st.tries > TRIES) return;
        if (Date.now() - st.tryAt < RETRY_GAP) return;
        st.tryAt = Date.now(); st.tries++;
        const pc = mk();
        st.sid = 's' + Math.random().toString(36).slice(2, 9);
        st.ctl = pc.createDataChannel('ctl', { ordered: true });
        st.ink = pc.createDataChannel('ink', { ordered: false, maxRetransmits: 0 });
        wire(st.ctl); wire(st.ink);
        st.ctl.onopen = checkOpen; st.ink.onopen = checkOpen;
        pc.createOffer()
          .then((o) => pc.setLocalDescription(o))
          .then(() => {
            if (st.pc === pc) opts.signal({ t: '__rtc', k: 'offer', sid: st.sid, sdp: pc.localDescription.sdp });
          })
          .catch(() => drop());
      }

      function signalIn(m) {
        if (!m || m.t !== '__rtc') return false;
        if (role === 'teacher') {
          if (m.k === 'answer' && m.sid === st.sid && st.pc && !st.remoteSet) {
            st.remoteSet = true;
            st.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }).then(flushIce).catch(() => drop());
          } else if (m.k === 'ice' && m.sid === st.sid && st.pc) {
            addIce(m.c);
          }
          return true;
        }
        if (m.k === 'offer') {
          if (st.sid === m.sid && st.pc) return true;      // 同一条 offer 重复到达
          const pc = mk();
          st.sid = m.sid;
          pc.ondatachannel = (ev) => {
            const ch = ev.channel;
            if (ch.label === 'ctl') st.ctl = ch; else st.ink = ch;
            wire(ch);
            ch.onopen = checkOpen;
            checkOpen();
          };
          pc.setRemoteDescription({ type: 'offer', sdp: m.sdp })
            .then(() => { st.remoteSet = true; flushIce(); return pc.createAnswer(); })
            .then((a) => pc.setLocalDescription(a))
            .then(() => { if (st.pc === pc) opts.signal({ t: '__rtc', k: 'answer', sid: st.sid, sdp: pc.localDescription.sdp }); })
            .catch(() => drop());
          return true;
        }
        if (m.k === 'ice') { if (m.sid === st.sid) addIce(m.c); return true; }
        return true;
      }

      function send(obj) {
        if (!st.ready || !st.ctl || st.ctl.readyState !== 'open') return false;
        let s;
        try { s = JSON.stringify(obj); } catch (_) { return false; }
        const d = obj && obj.d;
        const fast = d && (d.type === 'live' || d.type === 'cursor' || d.type === 'laser');
        if (s.length > BIG) {
          const id = 'c' + Math.random().toString(36).slice(2, 8);
          const n = Math.ceil(s.length / BIG);
          try {
            for (let i = 0; i < n; i++) st.ctl.send(JSON.stringify({ __cc: id, i, n, s: s.slice(i * BIG, (i + 1) * BIG) }));
            return true;
          } catch (_) { return false; }
        }
        try {
          if (fast && st.ink && st.ink.readyState === 'open') st.ink.send(s);
          else st.ctl.send(s);
          return true;
        } catch (_) { return false; }
      }

      setInterval(() => {
        if (!opts.hasPeer || !opts.hasPeer()) {
          if (st.ready || st.pc) drop();
          st.tries = 0;
          return;
        }
        teacherOffer();
      }, 2000);

      return {
        send,
        signalIn,
        close: drop,
        get ready() { return st.ready; },
        get state() { return st.pc ? st.pc.connectionState : 'none'; },
      };
    },
  };
})();
