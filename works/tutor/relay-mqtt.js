/* 静态托管用的中继：自带 MQTT 3.1.1 客户端（走 WebSocket，零依赖）。
   目的是把教室搬到 GitHub Pages 这类纯静态站点上，不需要用户电脑上的 node 服务。
   协议：房间 = 一个 topic；老师/学生各自 publish JSON，收到别人的就交给 handleMsg。
   自研实现，不依赖任何 CDN 库；断线自动重连由 app.js 的 connect() 负责。 */
(() => {
  /* 公共中继候选：双方按同一顺序尝试，哪条通就用哪条，保证老师和学生落在同一个上 */
  const BROKERS = [
    'wss://broker-cn.emqx.io:8084/mqtt',
    'wss://broker.emqx.io:8084/mqtt',
  ];
  const KEEP = 45;

  function varint(n) {
    const a = [];
    do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 0x80; a.push(b); } while (n > 0);
    return a;
  }
  function str(s) {
    const enc = new TextEncoder().encode(s);
    return [enc.length >> 8 & 255, enc.length & 255, ...enc];
  }
  function pkt(head, body) { return new Uint8Array([head, ...varint(body.length), ...body]); }

  function connectPacket(cid) {
    const body = [...str('MQTT'), 4, 0x02, KEEP >> 8 & 255, KEEP & 255, ...str(cid)];
    return pkt(0x10, body);
  }
  function subPacket(topic, id) {
    return pkt(0x82, [id >> 8 & 255, id & 255, ...str(topic), 0]);
  }
  function pubPacket(topic, payload) {
    return pkt(0x30, [...str(topic), ...new TextEncoder().encode(payload)]);
  }

  function parse(buf) {
    const out = [];
    let i = 0;
    while (i < buf.length) {
      const head = buf[i++];
      let mult = 1, len = 0, b;
      do { b = buf[i++]; len += (b & 127) * mult; mult *= 128; } while (b & 128);
      const body = buf.slice(i, i + len); i += len;
      out.push({ head, body });
    }
    return out;
  }

  window.RelayMQTT = {
    create(opts) {
      const topic = opts.topic, cid = opts.cid, role = opts.role, name = opts.name || '';
      const net = { readyState: 0, onopen: null, onmessage: null, onclose: null };
      let ws = null, pingT = null, helloT = null, dead = false, bi = 0, everUp = false;
      const peers = new Map();          // cid -> {name, role, at}
      const chunks = new Map();

      function emit(obj) { if (net.onmessage) net.onmessage({ data: JSON.stringify(obj) }); }

      function publish(strPayload) { if (ws && ws.readyState === 1) ws.send(pubPacket(topic, strPayload)); }

      /* 大消息拆包：一条 sync 可能几十上百 KB，公共中继单包会拒收 */
      function sendRaw(payload) {
        if (payload.length <= 3000) { publish(payload); return; }
        const id = Math.random().toString(36).slice(2, 8);
        const n = Math.ceil(payload.length / 3000);
        for (let i = 0; i < n; i++) {
          publish(JSON.stringify({ __c: id, __i: i, __n: n, __s: payload.slice(i * 3000, (i + 1) * 3000) }));
        }
      }

      function onPayload(text) {
        let m;
        try { m = JSON.parse(text); } catch (_) { return; }
        if (m && m.__c) {
          let e = chunks.get(m.__c);
          if (!e) { e = { n: m.__n, parts: new Array(m.__n), at: Date.now() }; chunks.set(m.__c, e); }
          e.parts[m.__i] = m.__s;
          if (e.parts.filter(Boolean).length === e.n) { chunks.delete(m.__c); onPayload(e.parts.join('')); }
          return;
        }
        if (m.cid === cid) return;                     // 自己的回声，忽略
        if (m.t === 'hello') {
          const known = peers.get(m.cid);
          peers.set(m.cid, { name: m.name, role: m.role, at: Date.now() });
          if (!known) emit({ t: 'peer-joined', name: m.name, role: m.role });
          return;
        }
        if (m.t === 'bye') { peers.delete(m.cid); emit({ t: 'peer-left' }); return; }
        emit(m);
      }

      function start() {
        const list = opts.url ? [opts.url] : BROKERS;
        const url = list[Math.min(bi, list.length - 1)];
        ws = new WebSocket(url, ['mqtt']);
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => { ws.send(connectPacket(cid)); };
        ws.onmessage = (ev) => {
          let arr = ev.data;
          if (typeof arr === 'string') return;
          const view = Array.isArray(arr) ? new Uint8Array(arr) : new Uint8Array(arr);
          parse(view).forEach(({ head, body }) => {
            const type = head >> 4;
            if (type === 2) {                          // CONNACK
              ws.send(subPacket(topic, 1));
              net.readyState = 1; everUp = true;
              if (net.onopen) net.onopen();
              hello();
              clearInterval(helloT); helloT = setInterval(hello, 2000);
              clearInterval(pingT); pingT = setInterval(() => { try { ws.send(new Uint8Array([0xC0, 0])); } catch (_) {} }, KEEP * 500);
              // 房间是否存在：学生等 4 秒没有老师心跳就报"房间不存在"
              setTimeout(() => {
                if (role !== 'student') return;
                let has = false;
                peers.forEach((p) => { if (p.role === 'teacher') has = true; });
                if (!has) emit({ t: 'error', wait: true, msg: '房间不存在或老师还没开课' });
              }, 4000);
              setInterval(() => {
                const now = Date.now();
                peers.forEach((p, k) => { if (now - p.at > 8000) { peers.delete(k); emit({ t: 'peer-left' }); } });
              }, 3000);
            } else if (type === 3) {                   // PUBLISH
              let tl = (body[0] << 8) | body[1];
              const t = new TextDecoder().decode(body.slice(2, 2 + tl));
              const payload = new TextDecoder().decode(body.slice(2 + tl));
              if (t === topic) onPayload(payload);
            }
          });
        };
        ws.onclose = () => {
          if (dead) return;
          net.readyState = 0; clearInterval(helloT); clearInterval(pingT);
          const list = opts.url ? [opts.url] : BROKERS;
          if (!everUp && bi < list.length - 1) { bi++; setTimeout(start, 1200); return; }   // 换一条中继再试
          if (net.onclose) net.onclose();
        };
        ws.onerror = () => {};
      }

      function hello() {
        publish(JSON.stringify({ t: 'hello', cid, role, name, at: Date.now() }));
      }

      net.send = (strPayload) => {
        let m = null;
        try { m = JSON.parse(strPayload); } catch (_) {}
        if (m && m.t === 'join') return;               // 加入由本模块自己处理
        sendRaw(strPayload);
      };
      net.close = () => {
        dead = true;
        try { publish(JSON.stringify({ t: 'bye', cid })); } catch (_) {}
        clearInterval(helloT); clearInterval(pingT);
        try { ws && ws.close(); } catch (_) {}
      };
      start();
      return net;
    },
  };
})();
