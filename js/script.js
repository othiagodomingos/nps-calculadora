// Utilidades
const BRL = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const PCT = (v) => `${(v * 100).toFixed(2)}%`;
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const parseNum = (el) => {
  if (!el) return 0;
  const s = String(el.value ?? '').replace('.', '').replace(',', '.'); // compatibilidade pt-PT/pt-BR
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

// Defaults a partir da planilha
const defaults = {
  meses: 1, // Observação: 1 mês reproduz os totais exibidos na planilha
  recorrentes: {
    baseCoorte: 15649,
    baseReal: 310995,
    dist: { pro: 0.3844885671, neu: 0.3240627912, det: 0.2914486417 },
    ticket: { pro: 1436.3302237136438, neu: 1397.5618203937136, det: 1411.250585341857 }
  },
  eventuais: {
    baseCoorte: 25147,
    baseReal: 1435825,
    dist: { pro: 0.4601442399, neu: 0.3186562915, det: 0.2211994686 },
    ticket: { pro: 602.6167622190142, neu: 583.2046932698017, det: 582.9084984984961 }
  }
};

const state = {
  meses: defaults.meses,
  recorrentes: {
    baseMode: 'coorte',
    base: defaults.recorrentes.baseCoorte,
    dist: { ...defaults.recorrentes.dist },
    ticket: { ...defaults.recorrentes.ticket },
    modelo: 'detToPro',
    mig: 0 // em fração (0 a 1)
  },
  eventuais: {
    baseMode: 'coorte',
    base: defaults.eventuais.baseCoorte,
    dist: { ...defaults.eventuais.dist },
    ticket: { ...defaults.eventuais.ticket },
    modelo: 'detToPro',
    mig: 0
  }
};

// Fórmulas
function nps(dist) {
  return 100 * (dist.pro - dist.det);
}

function receitaMensal(base, dist, ticket) {
  const Np = base * dist.pro;
  const Nn = base * dist.neu;
  const Nd = base * dist.det;
  return (Np * ticket.pro) + (Nn * ticket.neu) + (Nd * ticket.det);
}

function receitaPeriodo(base, dist, ticket, meses) {
  return receitaMensal(base, dist, ticket) * meses;
}

function aplicaConversao(dist, modelo, m) {
  const d = { ...dist };
  if (modelo === 'detToPro') {
    const mig = clamp(m, 0, d.det);
    d.det -= mig; d.pro += mig;
  } else if (modelo === 'neuToPro') {
    const mig = clamp(m, 0, d.neu);
    d.neu -= mig; d.pro += mig;
  } else if (modelo === 'detToNeu') {
    const mig = clamp(m, 0, d.det);
    d.det -= mig; d.neu += mig;
  }
  // Normaliza pequenos desvios de ponto flutuante
  const s = d.pro + d.neu + d.det;
  if (Math.abs(s - 1) > 1e-10) {
    d.pro /= s; d.neu /= s; d.det /= s;
  }
  return d;
}

function maxAlteracao(dist, modelo) {
  if (modelo === 'detToPro' || modelo === 'detToNeu') return dist.det;
  if (modelo === 'neuToPro') return dist.neu;
  return 0;
}

// Ligações de UI
const $ = (sel) => document.querySelector(sel);

function setDistributionInputs(prefix, dist) {
  $(`#${prefix}-pro`).value = (dist.pro * 100).toFixed(4);
  $(`#${prefix}-neu`).value = (dist.neu * 100).toFixed(4);
  $(`#${prefix}-det`).value = (dist.det * 100).toFixed(4);
}

function getDistributionFromInputs(prefix) {
  let pro = parseNum($(`#${prefix}-pro`));
  let neu = parseNum($(`#${prefix}-neu`));
  let det = parseNum($(`#${prefix}-det`));
  if (pro < 0) pro = 0; if (neu < 0) neu = 0; if (det < 0) det = 0;

  // Normaliza para somar 100 mantendo proporções
  const sum = pro + neu + det;
  if (sum === 0) {
    // fallback: deixa tudo zero menos promotores (100) para evitar NaN
    pro = 100; neu = 0; det = 0;
  } else {
    pro = (pro / sum) * 100;
    neu = (neu / sum) * 100;
    det = (det / sum) * 100;
  }
  return { pro: pro / 100, neu: neu / 100, det: det / 100 };
}

function setTickets(prefix, tk) {
  $(`#${prefix}-tk-pro`).value = tk.pro.toFixed(6);
  $(`#${prefix}-tk-neu`).value = tk.neu.toFixed(6);
  $(`#${prefix}-tk-det`).value = tk.det.toFixed(6);
}

function getTickets(prefix) {
  return {
    pro: parseNum($(`#${prefix}-tk-pro`)),
    neu: parseNum($(`#${prefix}-tk-neu`)),
    det: parseNum($(`#${prefix}-tk-det`))
  };
}

function renderBars(prefix, distAtual, distSim) {
  const barA = $(`#${prefix}-bar-atual`);
  const barS = $(`#${prefix}-bar-sim`);
  const seg = (pct, cls) => `<div class="seg-${cls}" style="width:${pct}%;"></div>`;

  const aPro = (distAtual.pro * 100).toFixed(2);
  const aNeu = (distAtual.neu * 100).toFixed(2);
  const aDet = (distAtual.det * 100).toFixed(2);

  const sPro = (distSim.pro * 100).toFixed(2);
  const sNeu = (distSim.neu * 100).toFixed(2);
  const sDet = (distSim.det * 100).toFixed(2);

  barA.innerHTML = seg(aPro, 'pro') + seg(aNeu, 'neu') + seg(aDet, 'det');
  barS.innerHTML = seg(sPro, 'pro') + seg(sNeu, 'neu') + seg(sDet, 'det');
}

function updateMaxPill(prefix, dist, modelo) {
  const max = maxAlteracao(dist, modelo);
  const pill = $(`#${prefix}-max-pill`);
  pill.textContent = `Máx. ${ (max * 100).toFixed(2) }%`;
  // Atualiza range e number max
  const range = $(`#${prefix}-mig`);
  const num = $(`#${prefix}-mig-num`);
  range.max = (max * 100).toFixed(4);
  num.max = (max * 100).toFixed(4);
}

function renderSegment(prefix, segState) {
  // Base
  $(`#${prefix}-base`).value = String(segState.base);

  // Dist e Tickets
  setDistributionInputs(prefix, segState.dist);
  setTickets(prefix, segState.ticket);

  // Modelo e Migração
  $(`#${prefix}-modelo`).value = segState.modelo;
  $(`#${prefix}-mig`).value = (segState.mig * 100).toFixed(4);
  $(`#${prefix}-mig-num`).value = (segState.mig * 100).toFixed(4);

  // KPIs
  const distAtual = segState.dist;
  const distSim = aplicaConversao(segState.dist, segState.modelo, segState.mig);
  const npsAtual = nps(distAtual);
  const npsSim = nps(distSim);
  const receitaA = receitaPeriodo(segState.base, distAtual, segState.ticket, state.meses);
  const receitaS = receitaPeriodo(segState.base, distSim, segState.ticket, state.meses);

  $(`#${prefix}-nps-atual`).textContent = `${npsAtual.toFixed(3)}`;
  $(`#${prefix}-nps-sim`).textContent = `${npsSim.toFixed(3)}`;
  $(`#${prefix}-receita-atual`).textContent = BRL(receitaA);
  $(`#${prefix}-receita-sim`).textContent = BRL(receitaS);
  $(`#${prefix}-delta`).textContent = BRL(receitaS - receitaA);
  $(`#${prefix}-meses-note`).textContent = String(state.meses);

  renderBars(prefix, distAtual, distSim);
  updateMaxPill(prefix, distAtual, segState.modelo);
}

function renderTotal() {
  const rec = state.recorrentes;
  const evt = state.eventuais;

  const distRecSim = aplicaConversao(rec.dist, rec.modelo, rec.mig);
  const distEvtSim = aplicaConversao(evt.dist, evt.modelo, evt.mig);

  const recA = receitaPeriodo(rec.base, rec.dist, rec.ticket, state.meses);
  const recS = receitaPeriodo(rec.base, distRecSim, rec.ticket, state.meses);
  const evtA = receitaPeriodo(evt.base, evt.dist, evt.ticket, state.meses);
  const evtS = receitaPeriodo(evt.base, distEvtSim, evt.ticket, state.meses);

  const totA = recA + evtA;
  const totS = recS + evtS;

  $('#tot-receita-atual').textContent = BRL(totA);
  $('#tot-receita-sim').textContent = BRL(totS);
  $('#tot-delta').textContent = BRL(totS - totA);
  $('#tot-meses-note').textContent = String(state.meses);
}

function renderAll() {
  renderSegment('rec', state.recorrentes);
  renderSegment('evt', state.eventuais);
  renderTotal();
}

// Eventos de UI
function bindTabNav() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-tab');
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.querySelector(`#panel-${target}`).classList.add('active');
    });
  });
}

function bindGlobal() {
  $('#input-meses').addEventListener('input', () => {
    const m = parseInt($('#input-meses').value, 10);
    state.meses = isNaN(m) || m < 1 ? 1 : m;
    renderAll();
  });

  $('#btn-reset').addEventListener('click', () => {
    // Reset geral
    state.meses = defaults.meses;
    $('#input-meses').value = defaults.meses;

    state.recorrentes = {
      baseMode: 'coorte',
      base: defaults.recorrentes.baseCoorte,
      dist: { ...defaults.recorrentes.dist },
      ticket: { ...defaults.recorrentes.ticket },
      modelo: 'detToPro',
      mig: 0
    };
    state.eventuais = {
      baseMode: 'coorte',
      base: defaults.eventuais.baseCoorte,
      dist: { ...defaults.eventuais.dist },
      ticket: { ...defaults.eventuais.ticket },
      modelo: 'detToPro',
      mig: 0
    };

    document.querySelector('input[name="rec-base-mode"][value="coorte"]').checked = true;
    document.querySelector('input[name="evt-base-mode"][value="coorte"]').checked = true;

    renderAll();
  });
}

function bindSegment(prefix, segKey, defaultsSegment) {
  // Base Mode radios
  document.querySelectorAll(`input[name="${prefix}-base-mode"]`).forEach(r => {
    r.addEventListener('change', () => {
      const mode = r.value;
      state[segKey].baseMode = mode;
      if (mode === 'coorte') state[segKey].base = defaultsSegment.baseCoorte;
      else if (mode === 'real') state[segKey].base = defaultsSegment.baseReal;
      // se custom, mantém o valor atual e permite editar
      renderAll();
    });
  });

  // Base input (para custom)
  $(`#${prefix}-base`).addEventListener('input', () => {
    const v = parseInt($(`#${prefix}-base`).value, 10);
    state[segKey].base = isNaN(v) || v < 0 ? 0 : v;
    // Se usuário editar manualmente, muda o modo para custom
    state[segKey].baseMode = 'custom';
    document.querySelector(`input[name="${prefix}-base-mode"][value="custom"]`).checked = true;
    renderAll();
  });

  // Distribuição
  ['pro', 'neu', 'det'].forEach(k => {
    $(`#${prefix}-${k}`).addEventListener('input', () => {
      state[segKey].dist = getDistributionFromInputs(prefix);
      // Ajusta limites de migração pois dependem do grupo de origem
      const modelo = state[segKey].modelo;
      const max = maxAlteracao(state[segKey].dist, modelo);
      state[segKey].mig = clamp(state[segKey].mig, 0, max);
      renderAll();
    });
  });

  // Tickets
  ['tk-pro', 'tk-neu', 'tk-det'].forEach(id => {
    $(`#${prefix}-${id}`).addEventListener('input', () => {
      state[segKey].ticket = getTickets(prefix);
      renderAll();
    });
  });

  // Modelo
  $(`#${prefix}-modelo`).addEventListener('change', () => {
    const modelo = $(`#${prefix}-modelo`).value;
    state[segKey].modelo = modelo;
    // Revalida mig máximo
    const max = maxAlteracao(state[segKey].dist, modelo);
    state[segKey].mig = clamp(state[segKey].mig, 0, max);
    renderAll();
  });

  // Migração (range + number)
  const syncMig = (pctValue) => {
    const modelo = state[segKey].modelo;
    const max = maxAlteracao(state[segKey].dist, modelo) * 100;
    const v = clamp(pctValue, 0, max);
    state[segKey].mig = v / 100;
    $(`#${prefix}-mig`).value = v.toFixed(4);
    $(`#${prefix}-mig-num`).value = v.toFixed(4);
    renderAll();
  };

  $(`#${prefix}-mig`).addEventListener('input', () => {
    syncMig(parseNum($(`#${prefix}-mig`)));
  });
  $(`#${prefix}-mig-num`).addEventListener('input', () => {
    syncMig(parseNum($(`#${prefix}-mig-num`)));
  });
}

// Inicialização
function init() {
  // Preencher UI com defaults
  $('#input-meses').value = state.meses;

  // Recorrentes
  document.querySelector('input[name="rec-base-mode"][value="coorte"]').checked = true;
  $('#rec-base').value = state.recorrentes.base;
  setDistributionInputs('rec', state.recorrentes.dist);
  setTickets('rec', state.recorrentes.ticket);
  $('#rec-modelo').value = state.recorrentes.modelo;
  $('#rec-mig').value = (state.recorrentes.mig * 100).toFixed(4);
  $('#rec-mig-num').value = (state.recorrentes.mig * 100).toFixed(4);

  // Eventuais
  document.querySelector('input[name="evt-base-mode"][value="coorte"]').checked = true;
  $('#evt-base').value = state.eventuais.base;
  setDistributionInputs('evt', state.eventuais.dist);
  setTickets('evt', state.eventuais.ticket);
  $('#evt-modelo').value = state.eventuais.modelo;
  $('#evt-mig').value = (state.eventuais.mig * 100).toFixed(4);
  $('#evt-mig-num').value = (state.eventuais.mig * 100).toFixed(4);

  // Bindings
  bindTabNav();
  bindGlobal();
  bindSegment('rec', 'recorrentes', defaults.recorrentes);
  bindSegment('evt', 'eventuais', defaults.eventuais);

  // Primeira renderização
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
