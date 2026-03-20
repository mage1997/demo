const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function sanitizeSegment(s) {
  if (!s || typeof s !== 'string') return 'project';
  return s
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .trim() || 'project';
}

function formatDate(date, fmt) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  if (fmt === 'compact') return `${y}${m}${d}`;
  if (fmt === 'datetime') return `${y}${m}${d}_${hh}${mm}${ss}`;
  return `${y}-${m}-${d}`;
}

function buildFromTemplate(template, vars) {
  let out = template;
  for (const [key, val] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(val);
  }
  return out;
}

function uniqueFilePaths(filePaths) {
  const seen = new Set();
  const out = [];
  for (const p of filePaths) {
    const key = process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function computeRows(filePaths, opts) {
  const paths = uniqueFilePaths(filePaths);
  const project = sanitizeSegment(opts.projectName || 'project');
  const dateFmt = opts.dateFormat || 'iso';
  const hashLen = Math.min(16, Math.max(4, Number(opts.hashLength) || 6));
  const indexStart = Math.max(0, Number(opts.indexStart) || 1);
  const indexDigits = Math.min(6, Math.max(1, Number(opts.indexDigits) || 3));
  const template =
    typeof opts.template === 'string' && opts.template.trim()
      ? opts.template.trim()
      : '{hash}_{date}_{project}_{index}{ext}';

  const now = new Date();
  const dateStr = formatDate(now, dateFmt);

  const rows = [];
  let idx = indexStart;

  for (const oldPath of paths) {
    const dir = path.dirname(oldPath);
    const ext = path.extname(oldPath);
    const base = path.extname(oldPath) ? path.basename(oldPath, ext) : path.basename(oldPath);
    const hashFull = crypto.createHash('sha256').update(`${oldPath}\n${idx}`).digest('hex');
    const hashShort = hashFull.slice(0, hashLen);
    const indexStr = String(idx).padStart(indexDigits, '0');

    const vars = {
      hash: hashShort,
      date: dateStr,
      project,
      index: indexStr,
      orig: base,
      ext: ext || '',
    };

    let newBase = buildFromTemplate(template, vars);
    newBase = sanitizeSegment(newBase.replace(/\\/g, '_').replace(/\//g, '_'));
    if (!newBase) newBase = `file_${indexStr}`;

    const hasExtPlaceholder = /\{ext\}/.test(template);
    let newName = hasExtPlaceholder ? newBase : newBase + ext;
    if (path.extname(newName) === '' && ext) newName += ext;

    const newPath = path.join(dir, newName);
    rows.push({
      oldPath,
      newPath,
      oldName: path.basename(oldPath),
      newName: path.basename(newPath),
    });
    idx += 1;
  }

  const used = new Map();
  for (const row of rows) {
    let key = row.newPath.toLowerCase();
    let candidate = row.newPath;
    let name = row.newName;
    let n = 1;
    while (used.has(key)) {
      n += 1;
      const dir = path.dirname(row.oldPath);
      const ext = path.extname(candidate) || path.extname(row.oldPath);
      const stem = path.basename(candidate, ext);
      name = `${stem}_${n}${ext}`;
      candidate = path.join(dir, name);
      key = candidate.toLowerCase();
    }
    used.set(key, true);
    row.newPath = candidate;
    row.newName = name;
  }

  return rows;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 800,
    minHeight: 520,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('select-files', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '选择要重命名的文件',
    properties: ['openFile', 'multiSelections'],
  });
  if (canceled || !filePaths.length) return [];
  return filePaths.filter((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
});

ipcMain.handle('preview', async (_e, payload) => {
  const { paths, options } = payload || {};
  if (!Array.isArray(paths) || paths.length === 0) return [];
  return computeRows(paths, options || {});
});

ipcMain.handle('apply', async (_e, rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: '没有可执行的重命名' };
  }

  const normalized = rows
    .filter((r) => r && r.oldPath && r.newPath)
    .map((r) => ({
      oldPath: path.resolve(r.oldPath),
      newPath: path.resolve(r.newPath),
    }));

  for (const r of normalized) {
    if (r.oldPath === r.newPath) continue;
    try {
      if (!fs.existsSync(r.oldPath)) {
        return { ok: false, error: `源文件不存在：${r.oldPath}` };
      }
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  const steps = normalized.filter((r) => r.oldPath !== r.newPath);
  const temps = [];

  const rollbackTemps = () => {
    for (const t of temps) {
      try {
        if (fs.existsSync(t.tmp) && !fs.existsSync(t.oldPath)) {
          fs.renameSync(t.tmp, t.oldPath);
        }
      } catch {
        /* ignore */
      }
    }
  };

  try {
    for (let i = 0; i < steps.length; i++) {
      const { oldPath, newPath } = steps[i];
      const dir = path.dirname(oldPath);
      const token = crypto.randomBytes(12).toString('hex');
      const tmp = path.join(dir, `.smart-rename-${token}-${i}.tmp`);
      fs.renameSync(oldPath, tmp);
      temps.push({ tmp, oldPath, final: newPath });
    }

    for (const t of temps) {
      const finalDir = path.dirname(t.final);
      if (!fs.existsSync(finalDir)) {
        throw new Error(`目标目录不存在：${finalDir}`);
      }
      if (fs.existsSync(t.final)) {
        throw new Error(`目标已存在，拒绝覆盖：${t.final}`);
      }
      fs.renameSync(t.tmp, t.final);
    }

    return { ok: true };
  } catch (e) {
    rollbackTemps();
    return { ok: false, error: String(e.message || e) };
  }
});
