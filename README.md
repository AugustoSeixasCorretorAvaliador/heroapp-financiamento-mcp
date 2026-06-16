# HEROAPP Financiamento MCP

Servidor MCP para expor a calculadora de simulacao de financiamento imobiliario na interface do ChatGPT.

## O que foi reaproveitado

- Base numerica do `heroia-platform/modules/credito.js`.
- Calculo PRICE.
- Calculo SAC com primeira e ultima parcela.
- Regra de comprometimento de 30% da renda.
- Ajuste estrategico por prazo ideal de 10 a 35 anos.
- Tratamento robusto de prazo em anos ou meses, incluindo `35 anos (420 meses)`.

## Arquivos principais

- `src/financeLogic.js`: logica pura da simulacao.
- `src/server.js`: servidor MCP com a ferramenta `simular_financiamento_imobiliario`.
- `chatgpt-app-submission.json`: rascunho para upload no cadastro do app.

## Como testar localmente

```bash
npm install
npm run check
npm run test:logic
npm start
```

O endpoint local fica em:

```text
http://localhost:3333/mcp
```

Para usar no Developer Mode do ChatGPT ou submeter para revisao publica, o MCP precisa estar publicado em HTTPS. Durante desenvolvimento, voce pode apontar um tunel HTTPS para a porta local:

```bash
ngrok http 3333
```

Depois substitua `https://SEU-DOMINIO-PUBLICO/mcp` no `chatgpt-app-submission.json` pela URL real.

## Exemplo de chamada esperada

```json
{
  "valor_imovel": 500000,
  "entrada": 100000,
  "fgts": 0,
  "renda_mensal": 12000,
  "prazo": "35 anos (420 meses)",
  "sistema": "SAC",
  "taxa_anual_percentual": 9.5
}
```

## Observacao importante

As simulacoes sao estimativas. A aprovacao real depende de analise bancaria, CET, seguros, politica de credito, idade, perfil do comprador e taxa vigente.
