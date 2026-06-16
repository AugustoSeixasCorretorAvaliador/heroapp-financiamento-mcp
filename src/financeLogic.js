import { pathToFileURL } from "node:url";

const DEFAULT_TAXA_ANUAL = 0.095;

const formatarBRL = (valor) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(valor);

const normalizarTexto = (texto) =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const normalizarNumero = (valor) => {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (!valor) return null;

  const lower = normalizarTexto(valor);
  const numeroMatch = lower.match(/(\d[\d.,]*)/);
  if (!numeroMatch) return null;

  let numerico = numeroMatch[1];
  let multiplicador = 1;

  if (/(^|\s)milhao(s)?(\s|$)/.test(lower) || /(milh[ao]es)/.test(lower)) {
    multiplicador = 1_000_000;
  } else if (/(^|\s)mil(\s|$)/.test(lower)) {
    multiplicador = 1_000;
  }

  numerico = numerico.replace(/\./g, "");
  if (numerico.includes(",")) {
    const partes = numerico.split(",");
    numerico = `${partes.slice(0, -1).join("")}.${partes.slice(-1)}`;
  }

  const numero = parseFloat(numerico) * multiplicador;
  return Number.isFinite(numero) ? numero : null;
};

export const extrairPrazoMeses = (valor) => {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return valor > 60 ? Math.round(valor) : Math.round(valor * 12);
  }

  const texto = normalizarTexto(valor);
  if (!texto) return null;

  const mesesMatch = texto.match(/(\d[\d.,]*)\s*(mes|meses)/);
  if (mesesMatch) return Math.round(normalizarNumero(mesesMatch[1]));

  const anosMatch = texto.match(/(\d[\d.,]*)\s*(ano|anos)/);
  if (anosMatch) return Math.round(normalizarNumero(anosMatch[1]) * 12);

  const numero = normalizarNumero(texto);
  if (numero === null) return null;
  return numero > 60 ? Math.round(numero) : Math.round(numero * 12);
};

const calcularPrice = (pv, taxaAnual, meses) => {
  const i = taxaAnual / 12;
  return pv * ((i * Math.pow(1 + i, meses)) / (Math.pow(1 + i, meses) - 1));
};

const calcularSAC = (pv, taxaAnual, meses) => {
  const i = taxaAnual / 12;
  const amortizacao = pv / meses;
  const primeira = amortizacao + pv * i;
  const saldoFinal = amortizacao;
  const ultima = amortizacao + saldoFinal * i;
  return { primeira, ultima };
};

const parcelaMaxima = (renda) => renda * 0.3;

const encontrarPrazoIdeal = (pv, renda, taxaAnual, sistema) => {
  const limite = parcelaMaxima(renda);
  for (let anos = 10; anos <= 35; anos += 1) {
    const meses = anos * 12;
    const taxaMensal = taxaAnual / 12;
    const parcela =
      sistema === "SAC"
        ? pv / meses + pv * taxaMensal
        : calcularPrice(pv, taxaAnual, meses);
    if (parcela <= limite) return { anos, meses, parcela };
  }
  return null;
};

const normalizarSistema = (sistema) => {
  const upper = String(sistema || "PRICE").toUpperCase();
  if (upper === "AMBOS" || upper === "BOTH" || upper === "SAC_PRICE") return ["SAC", "PRICE"];
  if (upper === "SAC") return ["SAC"];
  return ["PRICE"];
};

const validarEntrada = (dados) => {
  const valorImovel = normalizarNumero(dados.valor_imovel ?? dados.valor);
  const entrada = normalizarNumero(dados.entrada) ?? 0;
  const fgts = normalizarNumero(dados.fgts) ?? 0;
  const rendaMensal = normalizarNumero(dados.renda_mensal ?? dados.renda);
  const prazoMeses = extrairPrazoMeses(dados.prazo_meses ?? dados.prazo);
  const taxaAnual = (normalizarNumero(dados.taxa_anual_percentual) ?? DEFAULT_TAXA_ANUAL * 100) / 100;

  const faltando = [];
  if (valorImovel === null) faltando.push("valor_imovel");
  if (rendaMensal === null) faltando.push("renda_mensal");
  if (prazoMeses === null) faltando.push("prazo_meses ou prazo");

  if (faltando.length) {
    throw new Error(`Informe os campos obrigatorios: ${faltando.join(", ")}.`);
  }

  const valorFinanciado = Math.max(0, valorImovel - entrada - fgts);
  if (valorFinanciado <= 0) throw new Error("O valor financiado precisa ser maior que zero.");
  if (prazoMeses <= 0) throw new Error("O prazo precisa ser maior que zero.");
  if (rendaMensal <= 0) throw new Error("A renda mensal precisa ser maior que zero.");

  return {
    valorImovel,
    entrada,
    fgts,
    rendaMensal,
    prazoMeses,
    prazoAnos: prazoMeses / 12,
    taxaAnual,
    valorFinanciado,
    sistemas: normalizarSistema(dados.sistema),
  };
};

const montarAnalise = (comprometimento) => {
  if (comprometimento <= 30) return "Dentro do limite usual de 30% da renda.";
  if (comprometimento <= 35) return "Acima de 30%; pode exigir ajuste de prazo, entrada ou renda.";
  return "Comprometimento elevado; recomenda-se revisar entrada, prazo, renda ou valor do imovel.";
};

export const simularFinanciamento = (entrada) => {
  const dados = validarEntrada(entrada);

  const sistemas = dados.sistemas.map((sistema) => {
    const base =
      sistema === "SAC"
        ? calcularSAC(dados.valorFinanciado, dados.taxaAnual, dados.prazoMeses)
        : {
            primeira: calcularPrice(dados.valorFinanciado, dados.taxaAnual, dados.prazoMeses),
            ultima: calcularPrice(dados.valorFinanciado, dados.taxaAnual, dados.prazoMeses),
          };

    const parcelaReferencia = base.primeira;
    const comprometimento = (parcelaReferencia / dados.rendaMensal) * 100;
    const ajuste =
      parcelaReferencia > parcelaMaxima(dados.rendaMensal)
        ? encontrarPrazoIdeal(dados.valorFinanciado, dados.rendaMensal, dados.taxaAnual, sistema)
        : null;

    return {
      sistema,
      primeira_parcela: Number(base.primeira.toFixed(2)),
      ultima_parcela: Number(base.ultima.toFixed(2)),
      parcela_referencia: Number((ajuste?.parcela ?? parcelaReferencia).toFixed(2)),
      comprometimento_renda_percentual: Number(
        (((ajuste?.parcela ?? parcelaReferencia) / dados.rendaMensal) * 100).toFixed(2)
      ),
      ajuste_estrategico: ajuste
        ? {
            prazo_ideal_anos: ajuste.anos,
            prazo_ideal_meses: ajuste.meses,
            nova_parcela: Number(ajuste.parcela.toFixed(2)),
          }
        : null,
      analise: montarAnalise(comprometimento),
    };
  });

  return {
    resumo: {
      valor_imovel: dados.valorImovel,
      entrada: dados.entrada,
      fgts: dados.fgts,
      renda_mensal: dados.rendaMensal,
      valor_financiado: Number(dados.valorFinanciado.toFixed(2)),
      prazo_meses: dados.prazoMeses,
      prazo_anos: Number(dados.prazoAnos.toFixed(1)),
      taxa_anual_percentual: Number((dados.taxaAnual * 100).toFixed(2)),
    },
    sistemas,
    aviso:
      "Estimativa referencial, sujeita a analise do banco, politica de credito, taxa efetiva, seguros e CET.",
  };
};

export const formatarResultadoTexto = (resultado) => {
  const linhas = [
    "Simulacao estimada de financiamento imobiliario",
    "",
    `Valor do imovel: ${formatarBRL(resultado.resumo.valor_imovel)}`,
    `Entrada: ${formatarBRL(resultado.resumo.entrada)}`,
    `FGTS: ${formatarBRL(resultado.resumo.fgts)}`,
    `Valor financiado: ${formatarBRL(resultado.resumo.valor_financiado)}`,
    `Renda mensal: ${formatarBRL(resultado.resumo.renda_mensal)}`,
    `Prazo: ${resultado.resumo.prazo_meses} meses (${resultado.resumo.prazo_anos} anos)`,
    `Taxa considerada: ${resultado.resumo.taxa_anual_percentual.toFixed(2)}% a.a.`,
    "",
  ];

  resultado.sistemas.forEach((item) => {
    linhas.push(`Sistema ${item.sistema}`);
    linhas.push(`1a parcela estimada: ${formatarBRL(item.primeira_parcela)}`);
    linhas.push(`Ultima parcela estimada: ${formatarBRL(item.ultima_parcela)}`);
    linhas.push(`Comprometimento: ${item.comprometimento_renda_percentual.toFixed(2)}%`);
    if (item.ajuste_estrategico) {
      linhas.push(`Prazo ideal: ${item.ajuste_estrategico.prazo_ideal_anos} anos`);
      linhas.push(`Nova parcela: ${formatarBRL(item.ajuste_estrategico.nova_parcela)}`);
    }
    linhas.push(item.analise);
    linhas.push("");
  });

  linhas.push(resultado.aviso);
  return linhas.join("\n");
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const resultado = simularFinanciamento({
    valor_imovel: 500000,
    entrada: 100000,
    fgts: 0,
    renda_mensal: 12000,
    prazo: "35 anos (420 meses)",
    sistema: "SAC",
  });
  console.log(formatarResultadoTexto(resultado));
}
