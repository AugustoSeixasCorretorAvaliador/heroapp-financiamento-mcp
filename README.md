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

## Deploy Render

O servidor esta preparado para Render usando a porta definida pela plataforma:

```js
const PORT = Number(process.env.PORT || 3333);
```

Configuracao sugerida no Render:

- Runtime: Node.js 20 ou superior.
- Build Command: `npm install`.
- Start Command: `npm start`.
- Health Check Path: `/`.

O endpoint final de producao do MCP deve ser:

```text
https://mcp.hero.ia.br/mcp
```

## Variaveis de ambiente

Configure no Render:

```text
OPENAI_APPS_CHALLENGE=token_fornecido_pela_validacao_do_OpenAI_Apps
```

Essa variavel e usada pelo endpoint:

```text
GET /.well-known/openai-apps-challenge
```

Se `OPENAI_APPS_CHALLENGE` nao estiver configurada, o endpoint retorna `404` com a mensagem `Challenge token not configured`.

## DNS Cloudflare

No Cloudflare, configure o subdominio `mcp.hero.ia.br` apontando para o dominio publico gerado pelo Render.

Configuracao recomendada:

- Type: `CNAME`.
- Name: `mcp`.
- Target: dominio `.onrender.com` do servico Render.
- Proxy status: habilitado se o SSL/TLS estiver configurado como `Full` ou `Full (strict)`.

Depois confirme que estes endpoints respondem em HTTPS:

```text
GET https://mcp.hero.ia.br/
GET https://mcp.hero.ia.br/.well-known/openai-apps-challenge
POST https://mcp.hero.ia.br/mcp
```

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
