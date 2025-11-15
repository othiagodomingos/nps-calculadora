(function(){
  const $ = (sel) => document.querySelector(sel);
  const fmtPct = (n) => isFinite(n) ? `${n.toFixed(1)}%` : "—";
  const fmtBRL = (n) => isFinite(n) ? n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : "—";

  const inputs = {
    detratores: $("#detratores"),
    passivos: $("#passivos"),
    promotores: $("#promotores"),
    ticket: $("#ticket"),
    clientes: $("#clientesAtivos"),
    uplift: $("#uplift")
  };

  const out = {
    nps: $("#kpiNps"),
    faixa: $("#kpiNpsFaixa"),
    detrPct: $("#kpiDetrPct"),
    passPct: $("#kpiPassPct"),
    promPct: $("#kpiPromPct"),
    barDetr: $("#barDetr"),
    barPass: $("#barPass"),
    barProm: $("#barProm"),
    receita: $("#kpiReceita"),
    impacto: $("#kpiImpacto"),
    impactoNote: $("#kpiImpactoNote")
  };

  function faixaNps(nps){
    if (!isFinite(nps)) return "—";
    if (nps < 0) return "Crítico";
    if (nps < 50) return "Aperfeiçoamento";
    if (nps < 75) return "Qualidade";
    return "Excelência";
  }

  function calcular(){
    const detr = Number(inputs.detratores.value) || 0;
    const pass = Number(inputs.passivos.value) || 0;
    const prom = Number(inputs.promotores.value) || 0;
    const total = detr + pass + prom;

    const detrPct = total ? (detr/total)*100 : 0;
    const passPct = total ? (pass/total)*100 : 0;
    const promPct = total ? (prom/total)*100 : 0;

    const nps = total ? ( (promPct) - (detrPct) ) : NaN;

    out.detrPct.textContent = fmtPct(detrPct);
    out.passPct.textContent = fmtPct(passPct);
    out.promPct.textContent = fmtPct(promPct);
    out.nps.textContent = isFinite(nps) ? nps.toFixed(1) : "—";
    out.faixa.textContent = faixaNps(nps);

    out.barDetr.style.width = `${Math.max(0, Math.min(100, detrPct))}%`;
    out.barPass.style.width = `${Math.max(0, Math.min(100, passPct))}%`;
    out.barProm.style.width = `${Math.max(0, Math.min(100, promPct))}%`;

    // Receita simples: ticket médio x clientes ativos (mensal)
    const ticket = Number(inputs.ticket.value) || 0;
    const clientes = Number(inputs.clientes.value) || 0;
    const receita = ticket * clientes;

    // Impacto cenário: variação percentual de retenção aplicada sobre a receita
    const uplift = Number(inputs.uplift.value) || 0;
    const impacto = receita * (uplift/100);

    out.receita.textContent = fmtBRL(receita);
    out.impacto.textContent = fmtBRL(impacto);
    out.impactoNote.textContent = `Cenário com variação de retenção de ${uplift.toFixed(1)}%`;
  }

  function resetar(){
    inputs.detratores.value = 0;
    inputs.passivos.value = 0;
    inputs.promotores.value = 0;
    inputs.ticket.value = 0;
    inputs.clientes.value = 0;
    inputs.uplift.value = 0;
    calcular();
  }

  function copiarResumo(){
    const texto = [
      `NPS: ${out.nps.textContent} (${out.faixa.textContent})`,
      `% Detratores: ${out.detrPct.textContent}`,
      `% Passivos: ${out.passPct.textContent}`,
      `% Promotores: ${out.promPct.textContent}`,
      `Receita estimada mensal: ${out.receita.textContent}`,
      `Impacto do cenário: ${out.impacto.textContent} (${out.impactoNote.textContent})`
    ].join("\n");

    navigator.clipboard.writeText(texto).then(()=>{
      const btn = document.getElementById("btnCopiar");
      const label = btn.textContent;
      btn.textContent = "Copiado!";
      setTimeout(()=> btn.textContent = label, 1200);
    });
  }

  document.getElementById("btnCalcular").addEventListener("click", calcular);
  document.getElementById("btnReset").addEventListener("click", resetar);
  document.getElementById("btnCopiar").addEventListener("click", copiarResumo);

  // cálculo inicial
  calcular();
})();
