import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";
import authRoutes from "./routes/auth.js";
import paymentsRoutes from "./routes/payments.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/payments", paymentsRoutes);

app.get("/", (req, res) => {
  res.json({
    status: "online",
    sistema: "Zentra Backend",
  });
});

try {
  const conexao = await pool.getConnection();

  console.log("MySQL conectado");

  conexao.release();
} catch (erro) {
  console.error("Erro MySQL:", erro.message);
}

async function criarTabelas() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,

      nome VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      whatsapp VARCHAR(30),

      senha_hash VARCHAR(255) NOT NULL,

      assinatura_ativa BOOLEAN DEFAULT FALSE,

      assinatura_expira_em DATETIME NULL,

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pagamentos (
      id INT AUTO_INCREMENT PRIMARY KEY,

      usuario_id INT NOT NULL,

      valor DECIMAL(10,2) NOT NULL,

      status VARCHAR(50) DEFAULT 'pendente',

      mercado_pago_id VARCHAR(255),

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (usuario_id)
      REFERENCES usuarios(id)
    )
  `);

  console.log("Tabelas verificadas/criadas");
}

await criarTabelas();

const PORT = process.env.PORT || 3001;
app.get("/admin/resumo", async (req, res) => {
  try {
    const [[usuarios]] = await pool.query(`
      SELECT COUNT(*) AS total FROM usuarios
    `);

    const [[assinaturas]] = await pool.query(`
      SELECT COUNT(*) AS total 
      FROM usuarios 
      WHERE assinatura_ativa = true 
      AND assinatura_expira_em > NOW()
    `);

    const [[pagamentos]] = await pool.query(`
      SELECT COUNT(*) AS total, COALESCE(SUM(valor), 0) AS receita
      FROM pagamentos
      WHERE status = 'approved'
    `);

    res.json({
      usuarios: usuarios.total,
      assinaturas_ativas: assinaturas.total,
      pagamentos_aprovados: pagamentos.total,
      receita: pagamentos.receita,
    });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao buscar resumo." });
  }
});

app.get("/admin/usuarios", async (req, res) => {
  try {
    const [usuarios] = await pool.query(`
      SELECT 
        id,
        nome,
        email,
        whatsapp,
        assinatura_ativa,
        assinatura_expira_em,
        created_at
      FROM usuarios
      ORDER BY id DESC
    `);

    res.json(usuarios);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao listar usuários." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});