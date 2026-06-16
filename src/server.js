import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { formatarResultadoTexto, simularFinanciamento } from "./financeLogic.js";

const PORT = Number(process.env.PORT || 3333);
const transports = new Map();

const createMcpServer = () => {
  const server = new McpServer(
    {
      name: "heroapp-financiamento",
      version: "1.0.0",
    },
    {
      instructions:
        "Use a ferramenta de simulacao apenas para estimativas de financiamento imobiliario. Sempre informe que os valores dependem de analise bancaria, CET, seguros, politicas de credito e taxas vigentes.",
    }
  );

  registerAppTool(
    server,
    "simular_financiamento_imobiliario",
    {
      title: "Simular financiamento imobiliario",
      description:
        "Calcula uma estimativa de financiamento imobiliario com valor do imovel, entrada, FGTS, renda, prazo, taxa anual e sistema SAC ou PRICE.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        valor_imovel: z.union([z.number(), z.string()]).describe("Valor do imovel em reais."),
        entrada: z.union([z.number(), z.string()]).optional().describe("Entrada disponivel em reais."),
        fgts: z.union([z.number(), z.string()]).optional().describe("FGTS disponivel em reais."),
        renda_mensal: z.union([z.number(), z.string()]).describe("Renda bruta mensal em reais."),
        prazo: z
          .union([z.number(), z.string()])
          .describe("Prazo em anos ou meses. Exemplos: 35, 420 meses, 35 anos (420 meses)."),
        sistema: z.enum(["SAC", "PRICE", "AMBOS"]).default("PRICE"),
        taxa_anual_percentual: z
          .union([z.number(), z.string()])
          .optional()
          .describe("Taxa anual percentual. Padrao: 9.5."),
      },
      outputSchema: {
        resumo: z.object({
          valor_imovel: z.number(),
          entrada: z.number(),
          fgts: z.number(),
          renda_mensal: z.number(),
          valor_financiado: z.number(),
          prazo_meses: z.number(),
          prazo_anos: z.number(),
          taxa_anual_percentual: z.number(),
        }),
        sistemas: z.array(
          z.object({
            sistema: z.string(),
            primeira_parcela: z.number(),
            ultima_parcela: z.number(),
            parcela_referencia: z.number(),
            comprometimento_renda_percentual: z.number(),
            ajuste_estrategico: z
              .object({
                prazo_ideal_anos: z.number(),
                prazo_ideal_meses: z.number(),
                nova_parcela: z.number(),
              })
              .nullable(),
            analise: z.string(),
          })
        ),
        aviso: z.string(),
      },
      _meta: {
        "openai/toolInvocation/invoking": "Calculando simulacao...",
        "openai/toolInvocation/invoked": "Simulacao pronta.",
      },
    },
    async (input) => {
      const resultado = simularFinanciamento(input);
      return {
        structuredContent: resultado,
        content: [{ type: "text", text: formatarResultadoTexto(resultado) }],
      };
    }
  );

  return server;
};

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : undefined;
};

const isInitializeRequest = (body) => {
  const messages = Array.isArray(body) ? body : [body];
  return messages.some((message) => message?.method === "initialize");
};

const createTransport = async () => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
  });

  transport.onclose = () => {
    if (transport.sessionId) transports.delete(transport.sessionId);
  };

  await server.connect(transport);
  return transport;
};

const httpServer = createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;

  if (pathname === "/.well-known/openai-apps-challenge" && req.method === "GET") {
    const token = process.env.OPENAI_APPS_CHALLENGE;

    if (!token) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Challenge token not configured");
      return;
    }

    res.writeHead(200, {
      "content-type": "text/plain",
      "content-length": Buffer.byteLength(token),
    });
    res.end(token);
    return;
  }

  if (pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "heroapp-financiamento-mcp",
        version: "1.0.0",
      })
    );
    return;
  }

  if (pathname !== "/mcp") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Use /mcp para chamadas MCP." }));
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json", allow: "POST" });
    res.end(JSON.stringify({ error: "Metodo nao permitido. Use POST /mcp." }));
    return;
  }

  try {
    const sessionId = req.headers["mcp-session-id"];
    let transport = sessionId ? transports.get(sessionId) : undefined;
    const body = await readJsonBody(req);

    if (!transport && isInitializeRequest(body)) {
      transport = await createTransport();
    }

    if (!transport) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Sessao MCP ausente ou invalida. Envie initialize para criar uma sessao.",
        })
      );
      return;
    }

    await transport.handleRequest(req, res, body);

    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }
  } catch (error) {
    console.error("Erro MCP:", error);

    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Erro interno no MCP",
          detail: String(error?.message || error),
        })
      );
    }
  }
});

httpServer.listen(PORT, () => {
  console.log(`HEROAPP Financiamento MCP ouvindo em http://localhost:${PORT}/mcp`);
});
