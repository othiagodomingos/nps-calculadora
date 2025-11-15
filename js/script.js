// Formatação
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (x) => `${(x * 100).toFixed(2)}%`;
const fmtNps = (x) => x.toFixed(3);

// Valores padrão (planilha)
const defaults = {
  baseModel: 'coorte', // 'coorte' | 'real'
  recorrentes: {
    coorte: 15649,
    total: 310995,
    dist: { pro: 0.3844885671, neu: 0.3240627912, det: 0.2914486417 },
    ticket24m: { pro: 1436.3302237136438, neu: 1397.5618203937136, det: 1411.250585341857 },
    modelo: 'detToPro',
    migracaoPct: 0 // fração (0..1)
  },
  eventuais: {
    coorte: 25147,
    total: 1435825,
    dist: { pro: 0.4601442399, neu: 0.3186562915, det: 0.2211994686 },
    ticket24m: { pro: 602.6167622190142, neu: 583.2046932698017, det: 582.9084984984961 },
    modelo: 'detToPro',
    migracaoPct: 0
  }
};

// Utils
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

function normalizeDist(dist) {
  const s = dist.pro + dist.neu + dist.det;
  if (s === 0) return { pro: 1, neu: 0, det: 0 };
  return { pro: dist.pro / s, neu: dist.neu / s, det: dist.det / s };
}

function npsFromDist(dist) {
  return 100 * (dist.pro - dist.det);
}

function baseUsada(segState, baseModel) {
  return baseModel === 'coorte' ? segState.coorte : segState.total;
}

function receita24m(segState, baseModel, dist) {
  const base = baseUsada(segState, baseModel);
  const { ticket24m } = segState;
  const Np = base * dist.pro;
  const Nn = base * dist.neu;
  const Nd = base * dist.det;
  return (Np * ticket24m.pro) + (Nn * ticket24m.neu) + (Nd * ticket24m.det);
}

function aplicaConversao(dist, modelo, m) {
  const d = { ...dist };
  if (modelo === 'detToPro') {
    const mig = clamp(m, 0, d.det);
    d.det -= mig;
    d.pro += mig;
  } else if (modelo === 'neuToPro') {
    const mig = clamp(m, 0, d.neu);
    d.neu -= mig;
    d.pro += mig;
  } else if (modelo === 'detToNeu') {
    const mig = clamp(m, 0, d.det);
    d.det -= mig;
    d.neu += mig;
  }
  return normalizeDist(d);
}

function maxPermitido(dist, modelo) {
  if (modelo === 'detToPro' || modelo === 'detToNeu') return dist.det;
  if (modelo === 'neuToPro') return dist.neu;
  return 0;
}

function simulaSegmento(segState, baseModel) {
  const distAtual = normalizeDist(segState.dist);
  const modelo = segState.modelo;
  const m = segState.migracaoPct; // fração (0..1)
  const distSim = aplicaConversao(distAtual, modelo, m);

  const recAtual = receita24m(segState, baseModel, distAtual);
  const recSim = receita24m(segState, baseModel, distSim);

  return {
    distAtual, distSim,
    npsAtual: npsFromDist(distAtual),
    npsSim: npsFromDist(distSim),
    receitaAtual: recAtual,
    receitaSim: recSim,
    delta: recSim - recAtual,
    maxAlteracao: maxPermitido(distAtual, modelo)
  };
}

function consolidaTotal(recRes, evRes) {
  return {
    receitaAtual: recRes.receitaAtual + evRes.receitaAtual,
    receitaSim: recRes.receitaSim + evRes.receitaSim,
    delta: recRes.delta + evRes.delta
  };
}

// NPS consolidado ponderando bases e distribuições
function npsConsolidado(recState, evState, baseModel, usarDistSimulada = false) {
  const r = simulaSegmento(recState, baseModel);
  const e = simulaSegmento(evState, baseModel);
  const baseR = baseUsada(recState, baseModel);
  const baseE = baseUsada(evState, baseModel);
  const totalBase = baseR + baseE;

  const dr = usarDistSimulada ? r.distSim : r.distAtual;
  const de = usarDistSimulada ? e.distSim : e.distAtual;

  const pro = (dr.pro * baseR + de.pro * baseE) / totalBase;
  const det = (dr.det * baseR + de.det * baseE) / totalBase;
  return 100 * (pro - det);
}

// Estado reativo
const state = JSON.parse(JSON.stringify(defaults));

// DOM refs
const $ = (sel) => document.querySelector(sel);
const bindNumber = (id, getter, setter, onInput) => {
  const el = $(id);
  el.value = getter();
  el.addEventListener('input', () => {
    setter(el.value);
    onInput && onInput();
  });
  return el;
};

function init() {
  // Tabs
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('#panel-' + btn.dataset.tab).classList.add('active');
    });
  });

  // BaseModel radios
  document.querySelectorAll('input[name="baseModel"]').forEach(r => {
    r.addEventListener('change', () => {
      state.baseModel = r.value === 'coorte' ? 'coorte' : 'real';
      renderAll();
    });
  });

  // Bind Recorrentes inputs
  bindNumber('#rec-coorte', () => state.recorrentes.coorte, v => state.recorrentes.coorte = +v, renderAll);
  bindNumber('#rec-total', () => state.recorrentes.total, v => state.recorrentes.total = +v, renderAll);

  bindNumber('#rec-pro', () => state.recorrentes.dist.pro * 100, v => state.recorrentes.dist.pro = (+v)/100, renderAll);
  bindNumber('#rec-neu', () => state.recorrentes.dist.neu * 100, v => state.recorrentes.dist.neu = (+v)/100, renderAll);
  bindNumber('#rec-det', () => state.recorrentes.dist.det * 100, v => state.recorrentes.dist.det = (+v)/100, renderAll);

  bindNumber('#rec-t-pro', () => state.recorrentes.ticket24m.pro, v => state.recorrentes.ticket24m.pro = +v, renderAll);
  bindNumber('#rec-t-neu', () => state.recorrentes.ticket24m.neu, v => state.recorrentes.ticket24m.neu = +v, renderAll);
  bindNumber('#rec-t-det', () => state.recorrentes.ticket24m.det, v => state.recorrentes.ticket24m.det = +v, renderAll);

  $('#rec-modelo').value = state.recorrentes.modelo;
  $('#rec-modelo').addEventListener('change', () => { state.recorrentes.modelo = $('#rec-modelo').value; renderAll(); });

  const recSlider = $('#rec-migr-slider');
  const recInput  = $('#rec-migr-input');
  const syncRecMig = (valPct) => {
    valPct = clamp(valPct, 0, 100);
    recSlider.value = String(valPct);
    recInput.value = String(valPct);
    state.recorrentes.migracaoPct = valPct / 100;
    renderAll();
  };
  recSlider.addEventListener('input', () => syncRecMig(+recSlider.value));
  recInput.addEventListener('input', () => syncRecMig(+recInput.value));

  // Bind Eventuais inputs
  bindNumber('#ev-coorte', () => state.eventuais.coorte, v => state.eventuais.coorte = +v, renderAll);
  bindNumber('#ev-total', () => state.eventuais.total, v => state.eventuais.total = +v, renderAll);

  bindNumber('#ev-pro', () => state.eventuais.dist.pro * 100, v => state.eventuais.dist.pro = (+v)/100, renderAll);
  bindNumber('#ev-neu', () => state.eventuais.dist.neu * 100, v => state.eventuais.dist.neu = (+v)/100, renderAll);
  bindNumber('#ev-det', () => state.eventuais.dist.det * 100, v => state.eventuais.dist.det = (+v)/100, renderAll);

  bindNumber('#ev-t-pro', () => state.eventuais.ticket24m.pro, v => state.eventuais.ticket24m.pro = +v, renderAll);
  bindNumber('#ev-t-neu', () => state.eventuais.ticket24m.neu, v => state.eventuais.ticket24m.neu = +v, renderAll);
  bindNumber('#ev-t-det', () => state.eventuais.ticket24m.det, v => state.eventuais.ticket24m.det = +v, renderAll);

  $('#ev-modelo').value = state.eventuais.modelo;
  $('#ev-modelo').addEventListener('change', () => { state.eventuais.modelo = $('#ev-modelo').value; renderAll(); });

  const evSlider = $('#ev-migr-slider');
  const evInput  = $('#ev-migr-input');
  const syncEvMig = (valPct) => {
    valPct = clamp(valPct, 0, 100);
    evSlider.value = String(valPct);
    evInput.value = String(valPct);
    state.eventuais.migracaoPct = valPct / 100;
    renderAll();
  };
  evSlider.addEventListener('input', () => syncEvMig(+evSlider.value));
  evInput.addEventListener('input', () => syncEvMig(+evInput.value));

  // Inicializa sliders em 0%
  recSlider.value = '0'; recInput.value = '0';
  evSlider.value  = '0'; evInput.value  = '0';

  renderAll();
}

// Renderização
function renderSegment(prefix, segState) {
  const baseModel = state.baseModel;
  const res = simulaSegmento(segState, baseModel);

  // Máximo permitido para a migração (em %)
  const maxPct = res.maxAlteracao * 100;
  const hintEl = $(`#${prefix}-max-hint`);
  hintEl.textContent = `Máximo permitido: ${maxPct.toFixed(2)}%`;

  // Atualiza limites dos sliders/inputs para o máximo atual
  const slider = $(`#${prefix}-migr-slider`);
  const input  = $(`#${prefix}-migr-input`);
  slider.max = String(maxPct);
  input.max = String(maxPct);

  // KPIs
  $(`#${prefix}-nps-atual`).textContent = fmtNps(res.npsAtual);
  $(`#${prefix}-nps-sim`).textContent = fmtNps(res.npsSim);
  const npsDelta = res.npsSim - res.npsAtual;
  $(`#${prefix}-nps-delta`).textContent = (npsDelta >= 0 ? '+' : '') + fmtNps(npsDelta);

  $(`#${prefix}-rec-atual`).textContent = fmtBRL.format(res.receitaAtual);
  $(`#${prefix}-rec-sim`).textContent = fmtBRL.format(res.receitaSim);
  const deltaEl = $(`#${prefix}-rec-delta`);
  deltaEl.textContent = (res.delta >= 0 ? '+' : '') + fmtBRL.format(res.delta);
  deltaEl.classList.toggle('negative', res.delta < 0);

  // Distribuições
  $(`#${prefix}-dist-pro-atual`).textContent = fmtPct(res.distAtual.pro);
  $(`#${prefix}-dist-neu-atual`).textContent = fmtPct(res.distAtual.neu);
  $(`#${prefix}-dist-det-atual`).textContent = fmtPct(res.distAtual.det);

  $(`#${prefix}-dist-pro-sim`).textContent = fmtPct(res.distSim.pro);
  $(`#${prefix}-dist-neu-sim`).textContent = fmtPct(res.distSim.neu);
  $(`#${prefix}-dist-det-sim`).textContent = fmtPct(res.distSim.det);
}

function renderTotal() {
  const recRes = simulaSegmento(state.recorrentes, state.baseModel);
  const evRes  = simulaSegmento(state.eventuais, state.baseModel);
  const tot = consolidaTotal(recRes, evRes);

  $('#tot-rec-atual').textContent = fmtBRL.format(tot.receitaAtual);
  $('#tot-rec-sim').textContent   = fmtBRL.format(tot.receitaSim);

  const deltaEl = $('#tot-rec-delta');
  deltaEl.textContent = (tot.delta >= 0 ? '+' : '') + fmtBRL.format(tot.delta);
  deltaEl.classList.toggle('negative', tot.delta < 0);

  const npsAtual = npsConsolidado(state.recorrentes, state.eventuais, state.baseModel, false);
  const npsSim   = npsConsolidado(state.recorrentes, state.eventuais, state.baseModel, true);
  $('#tot-nps-atual').textContent = fmtNps(npsAtual);
  $('#tot-nps-sim').textContent   = fmtNps(npsSim);
  const d = npsSim - npsAtual;
  $('#tot-nps-delta').textContent = (d >= 0 ? '+' : '') + fmtNps(d);
}

function renderAll() {
  // Preenche inputs (garante sincronismo caso a normalização altere distribuição)
  $('#rec-pro').value = (state.recorrentes.dist.pro * 100).toFixed(6);
  $('#rec-neu').value = (state.recorrentes.dist.neu * 100).toFixed(6);
  $('#rec-det').value = (state.recorrentes.dist.det * 100).toFixed(6);

  $('#ev-pro').value = (state.eventuais.dist.pro * 100).toFixed(6);
  $('#ev-neu').value = (state.eventuais.dist.neu * 100).toFixed(6);
  $('#ev-det').value = (state.eventuais.dist.det * 100).toFixed(6);

  // Renderiza segmentos e total
  renderSegment('rec', state.recorrentes);
  renderSegment('ev', state.eventuais);
  renderTotal();
}

document.addEventListener('DOMContentLoaded', init);
