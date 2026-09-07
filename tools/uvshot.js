// UV scale check by eye: paints the listed items and the board floor with textures/checker/color.png (1 m = 8 cells) and screenshots each
// from a close pose, tools/out/uv-<id>.png. Red cell must sit top-left of every face, cells must be 12.5 cm on box, bevel, cylinder and cushion alike.
// Usage: node tools/uvshot.js [id ...]   (default: sofa table chair1 kidbed basin lamp board)
const path = require('path'), { chromium } = require('playwright');
(async () => {
  const root = path.dirname(__dirname), ids = process.argv.length > 2 ? process.argv.slice(2) : ['sofa', 'table', 'chair1', 'kidbed', 'basin', 'lamp', 'board'];
  let browser; try { browser = await chromium.launch({ args: ['--allow-file-access-from-files'] }); } catch (e) { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] }); }
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.goto('file://' + path.join(root, 'index.html')); await page.waitForTimeout(1500);
  await page.evaluate(async () => { for (let i = 0; i < 100 && Object.values(ITEM_GROUPS).some(g => g.userData.glb && !g.userData.glbLoaded && !(VIZ.loadErrors || []).some(s => s.startsWith(g.userData.id + ':'))); i++) await new Promise(r => setTimeout(r, 100)); });
  for (const id of ids) {
    await page.evaluate(async id => {
      const tex = await new Promise((res, rej) => new THREE.TextureLoader().load('textures/checker/color.png', res, undefined, rej)); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const m = new THREE.MeshBasicMaterial({ map: tex });
      const g = id === 'board' ? boardGroup : ITEM_GROUPS[id]; if (!g) throw new Error('no item ' + id);
      const bb = new THREE.Box3().setFromObject(g), c = new THREE.Vector3(), s = new THREE.Vector3(); bb.getCenter(c); bb.getSize(s);
      const room = PLAN.rooms.find(r => r.id === g.userData.room), lab = room ? room.label : [c.x + 1, c.z + 1]; let dx = lab[0] - c.x, dz = lab[1] - c.z, L = Math.hypot(dx, dz); if (L < 0.3) { dx = dz = 0.7; L = 1; } dx /= L; dz /= L;
      const d = Math.min(Math.max(s.x, s.z) * (id === 'board' ? 0.35 : 1.1) + 0.6, Math.max(0.6, L * 0.9)); controls.setFPV(c.x + d * dx, c.z + d * dz, Math.atan2(-dx, -dz)); // eye 1.57 m, from the room-centre side, never past the centre, looking back at the item
      controls.phi = Math.PI / 2 + Math.atan((1.57 - c.y) / d); controls.apply(); // tilt down onto the item
      const back = Math.hypot(camera.position.x - controls.pos.x, camera.position.z - controls.pos.z), f = Math.max(0.3, d - back); controls.pos.set(c.x + f * dx, 1.57, c.z + f * dz); controls.apply(); // the walk camera sits behind the avatar, so step forward by that much; syncMode already ran, paint after it
      camera.position.set(c.x + d * dx, Math.max(c.y + 0.3, 1.2), c.z + d * dz); camera.lookAt(c); // then place the camera itself at d from the item (no input event, so the rig does not re-apply)
      g.traverse(o => { if (o.isMesh) o.material = m; }); if (window.avatar) avatar.visible = false;
      await new Promise(r => setTimeout(r, 400)); return { pos: controls.pos.toArray().map(v => +v.toFixed(2)), fpv: controls.fpv, plan: controls.plan, phi: +controls.phi.toFixed(2), theta: +controls.theta.toFixed(2), cam: camera.position.toArray().map(v => +v.toFixed(2)) };
    }, id).then(r => process.env.UV_DEBUG && console.log(id, JSON.stringify(r)));
    await page.screenshot({ path: path.join(__dirname, 'out', 'uv-' + id + '.png') }); console.log('uv-' + id + '.png');
    await page.reload(); await page.waitForTimeout(1500);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
