const $ = (id) => document.getElementById(id);

let paths = [];
let lastRows = [];

function optionsFromForm() {
  return {
    projectName: $('projectName').value,
    dateFormat: $('dateFormat').value,
    hashLength: Number($('hashLength').value),
    indexStart: Number($('indexStart').value),
    indexDigits: Number($('indexDigits').value),
    template: $('template').value,
  };
}

function setStatus(text, kind) {
  const el = $('status');
  el.textContent = text || '';
  el.classList.remove('err', 'ok');
  if (kind) el.classList.add(kind);
}

function renderTable(rows) {
  const tbody = $('tbody');
  tbody.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    const same = r.oldName === r.newName;
    tr.innerHTML = `
      <td class="cell-old"></td>
      <td class="cell-new"></td>
      <td></td>
    `;
    tr.cells[0].textContent = r.oldName;
    tr.cells[1].textContent = r.newName;
    const badge = document.createElement('span');
    badge.className = `badge ${same ? 'same' : 'change'}`;
    badge.textContent = same ? '无变化' : '将修改';
    tr.cells[2].appendChild(badge);
    tbody.appendChild(tr);
  }
}

async function refreshPreview() {
  if (!window.smartRename) {
    setStatus('请在 Electron 中运行（npm start）', 'err');
    return;
  }
  if (!paths.length) {
    lastRows = [];
    renderTable([]);
    $('btnApply').disabled = true;
    setStatus('请先选择文件');
    return;
  }
  setStatus('计算预览…');
  try {
    const rows = await window.smartRename.preview({
      paths,
      options: optionsFromForm(),
    });
    lastRows = rows;
    renderTable(rows);
    const hasChange = rows.some((r) => r.oldName !== r.newName);
    $('btnApply').disabled = !hasChange;
    setStatus(`共 ${rows.length} 个文件`, hasChange ? 'ok' : '');
  } catch (e) {
    setStatus(String(e.message || e), 'err');
  }
}

async function onPick() {
  const picked = await window.smartRename.selectFiles();
  paths = picked || [];
  setStatus(paths.length ? `已选 ${paths.length} 个文件` : '未选择文件');
  await refreshPreview();
}

async function onApply() {
  if (!lastRows.length) return;
  const toApply = lastRows.filter((r) => r.oldName !== r.newName);
  if (!toApply.length) return;
  const ok = window.confirm(`确定将 ${toApply.length} 个文件按预览结果重命名？此操作不可撤销。`);
  if (!ok) return;
  setStatus('执行中…');
  const result = await window.smartRename.apply(toApply);
  if (result.ok) {
    setStatus('重命名完成', 'ok');
    paths = toApply.map((r) => r.newPath);
    await refreshPreview();
  } else {
    setStatus(result.error || '失败', 'err');
  }
}

$('btnPick').addEventListener('click', onPick);
$('btnPreview').addEventListener('click', refreshPreview);
$('btnApply').addEventListener('click', onApply);

['projectName', 'dateFormat', 'hashLength', 'indexStart', 'indexDigits', 'template'].forEach((id) => {
  $(id).addEventListener('change', () => {
    if (paths.length) refreshPreview();
  });
});
$('projectName').addEventListener('input', () => {
  if (paths.length) refreshPreview();
});
$('template').addEventListener('input', () => {
  if (paths.length) refreshPreview();
});

if (window.smartRename) {
  setStatus('请选择文件');
} else {
  setStatus('请在 Electron 中运行：npm start', 'err');
}
