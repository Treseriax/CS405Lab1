const canvas = document.querySelector('canvas');


if (!navigator.gpu) throw new Error('WebGPU not supported');

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error('No GPU adapter found');
const device = await adapter.requestDevice();
const ctx = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device, format, alphaMode: 'opaque' });
console.log('WebGPU ready:', format);


const MIN_N = 3, MAX_N = 64;
let slider = document.querySelector('#sides');
if (!slider) {
  const box = document.createElement('label');
  box.style.cssText =
    'position:fixed;top:12px;left:12px;padding:8px 12px;border-radius:8px;' +
    'background:rgba(0,0,0,.55);color:#fff;font:14px system-ui;display:flex;gap:8px;align-items:center;z-index:10';
  box.innerHTML = `N = <span id="sides-val"></span>
    <input id="sides" type="range" min="${MIN_N}" max="${MAX_N}" step="1" value="6">`;
  document.body.appendChild(box);
  slider = box.querySelector('#sides');
}
const sliderLabel = document.querySelector('#sides-val');
const showN = () => { if (sliderLabel) sliderLabel.textContent = slider.value; };
slider.addEventListener('input', showN);
showN();


const module = device.createShaderModule({
  code: /* wgsl */ `
struct Uniforms {
  angle  : f32,     
  aspect : f32,
  mouse  : vec2f,   
  n      : f32,    
  _pad   : f32,
};
@group(0) @binding(0) var<uniform> u : Uniforms;

struct VSOut {
  @builtin(position) pos   : vec4f,
  @location(0)       local : vec2f,   
};

const PI = 3.14159265;
const RADIUS = 0.35;

@vertex fn vs_main(@builtin(vertex_index) i : u32) -> VSOut {
  let n   = u32(u.n);
  let tri = i / 3u;      
  let k   = i % 3u;     

  var local = vec2f(0.0, 0.0);
  if (k != 0u) {
    let idx = tri + k - 1u;                               
    let a = f32(idx) / f32(n) * 2.0 * PI + 0.5 * PI;    
    local = vec2f(cos(a), sin(a));
  }

  
  let c = cos(u.angle);
  let s = sin(u.angle);
  var p = RADIUS * vec2f(local.x * c - local.y * s, local.x * s + local.y * c);

  
  p.x = p.x / u.aspect;
  p = p + u.mouse;

  var out : VSOut;
  out.pos = vec4f(p, 0.0, 1.0);
  out.local = local;
  return out;
}

@fragment fn fs_main(in : VSOut) -> @location(0) vec4f {
  let d = clamp(length(in.local), 0.0, 1.0);   
  let center = vec3f(1.0, 0.95, 0.55);          
  let mid    = vec3f(1.0, 0.35, 0.25);          
  let edge   = vec3f(0.45, 0.1, 0.65);          
  var col = mix(center, mid, smoothstep(0.0, 0.6, d));
  col = mix(col, edge, smoothstep(0.5, 1.0, d));
  return vec4f(col, 1.0);
}
`,
});

const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: { module, entryPoint: 'vs_main' },
  fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
  primitive: { topology: 'triangle-list' },
});


const uniformBuffer = device.createBuffer({
  size: 32,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const bind = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
});
const uniforms = new Float32Array(8);

const mouse = { x: 0, y: 0 };
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  mouse.y = -(((e.clientY - r.top) / r.height) * 2 - 1); 
});


function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
}
window.addEventListener('resize', resize);
resize();


let angle = 0;
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); 
  last = now;

  const aspect = canvas.width / canvas.height;

  const dist = Math.hypot(mouse.x * aspect, mouse.y);
  const speed = 0.3 + 3.0 * dist;   
  angle += speed * dt;

  const n = Math.min(MAX_N, Math.max(MIN_N, parseInt(slider.value, 10) || MIN_N));

  uniforms[0] = angle;
  uniforms[1] = aspect;
  uniforms[2] = mouse.x;
  uniforms[3] = mouse.y;
  uniforms[4] = n;
  device.queue.writeBuffer(uniformBuffer, 0, uniforms);

  const enc = device.createCommandEncoder();
  const pass = enc.beginRenderPass({
    colorAttachments: [{
      view: ctx.getCurrentTexture().createView(),
      clearValue: { r: 0.19, g: 0.2, b: 0.6, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bind);
  pass.draw(3 * n);   

  pass.end();
  device.queue.submit([enc.finish()]);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);