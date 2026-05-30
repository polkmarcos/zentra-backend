import express from "express";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import pool from "../db.js";

const router = express.Router();

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
});

router.post("/create-checkout", async (req, res) => {
  try {
    const { usuario_id } = req.body;

    if (!usuario_id) {
      return res.status(400).json({ erro: "Usuário não informado." });
    }

    const preference = new Preference(client);
    console.log(
        "Notification URL:",
        `${process.env.BACKEND_URL}/payments/webhook`
        );

    const result = await preference.create({
      body: {
        items: [
          {
            title: "Zentra Produtividade - Acesso mensal",
            quantity: 1,
            unit_price: 9.9,
            currency_id: "BRL",
          },
        ],
        metadata: {
          usuario_id,
        },
        external_reference: String(usuario_id),
        back_urls: {
          success: process.env.FRONTEND_URL,
          failure: process.env.FRONTEND_URL,
          pending: process.env.FRONTEND_URL,
        },
        notification_url: `${process.env.BACKEND_URL}/payments/webhook`,
      },
    });

    await pool.query(
      `INSERT INTO pagamentos 
      (usuario_id, valor, status, mercado_pago_id) 
      VALUES (?, ?, ?, ?)`,
      [usuario_id, 9.9, "checkout_criado", result.id]
    );

    res.json({
      checkout_url: result.init_point,
      preference_id: result.id,
    });
  } catch (erro) {
    console.error("Erro Mercado Pago:", erro);
    res.status(500).json({ erro: "Erro ao criar checkout." });
  }
});

router.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    console.log("Webhook recebido:", body);

    const paymentId = body?.data?.id;

    if (!paymentId) {
      return res.sendStatus(200);
    }

    const payment = new Payment(client);
    const pagamento = await payment.get({ id: paymentId });

    console.log("Pagamento consultado:", {
      id: pagamento.id,
      status: pagamento.status,
      external_reference: pagamento.external_reference,
    });

    const usuarioId = pagamento.external_reference;

    if (!usuarioId) {
      return res.sendStatus(200);
    }

    await pool.query(
      `UPDATE pagamentos 
       SET status = ?, mercado_pago_id = ? 
       WHERE usuario_id = ? 
       ORDER BY id DESC 
       LIMIT 1`,
      [pagamento.status, String(pagamento.id), usuarioId]
    );

    if (pagamento.status === "approved") {
      const dataExpiracao = new Date();
      dataExpiracao.setDate(dataExpiracao.getDate() + 30);

      await pool.query(
        `UPDATE usuarios 
         SET assinatura_ativa = true, assinatura_expira_em = ? 
         WHERE id = ?`,
        [dataExpiracao, usuarioId]
      );

      console.log(`Assinatura liberada para usuário ${usuarioId}`);
    }

    res.sendStatus(200);
  } catch (erro) {
    console.error("Erro webhook:", erro);
    res.sendStatus(500);
  }
});

export default router;