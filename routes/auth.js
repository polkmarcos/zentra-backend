import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../db.js";

const router = express.Router();

function gerarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, email: usuario.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

router.post("/register", async (req, res) => {
  try {
    const { nome, email, whatsapp, senha } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ erro: "Nome, e-mail e senha são obrigatórios." });
    }

    const [existe] = await pool.query("SELECT id FROM usuarios WHERE email = ?", [email]);

    if (existe.length > 0) {
      return res.status(400).json({ erro: "Este e-mail já está cadastrado." });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const [resultado] = await pool.query(
      `INSERT INTO usuarios 
      (nome, email, whatsapp, senha_hash, assinatura_ativa, assinatura_expira_em) 
      VALUES (?, ?, ?, ?, false, NULL)`,
      [nome, email, whatsapp, senhaHash]
    );

    const usuario = {
      id: resultado.insertId,
      nome,
      email,
      whatsapp,
      assinatura_ativa: false,
      assinatura_expira_em: null,
    };

    const token = gerarToken(usuario);

    res.status(201).json({
      mensagem: "Usuário cadastrado com sucesso.",
      token,
      usuario,
    });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao cadastrar usuário." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: "E-mail e senha são obrigatórios." });
    }

    const [usuarios] = await pool.query("SELECT * FROM usuarios WHERE email = ?", [email]);

    if (usuarios.length === 0) {
      return res.status(401).json({ erro: "E-mail ou senha inválidos." });
    }

    const usuario = usuarios[0];

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash);

    if (!senhaCorreta) {
      return res.status(401).json({ erro: "E-mail ou senha inválidos." });
    }

    const token = gerarToken(usuario);

    res.json({
      mensagem: "Login realizado com sucesso.",
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        whatsapp: usuario.whatsapp,
        assinatura_ativa: Boolean(usuario.assinatura_ativa),
        assinatura_expira_em: usuario.assinatura_expira_em,
      },
    });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao fazer login." });
  }
});

router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ erro: "Token não enviado." });
    }

    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [usuarios] = await pool.query(
      "SELECT id, nome, email, whatsapp, assinatura_ativa, assinatura_expira_em FROM usuarios WHERE id = ?",
      [decoded.id]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ erro: "Usuário não encontrado." });
    }

    res.json({ usuario: usuarios[0] });
  } catch (erro) {
    res.status(401).json({ erro: "Token inválido." });
  }
});

router.post("/liberar-teste", async (req, res) => {
  try {
    const { usuario_id } = req.body;

    const dataExpiracao = new Date();
    dataExpiracao.setDate(dataExpiracao.getDate() + 30);

    await pool.query(
      "UPDATE usuarios SET assinatura_ativa = true, assinatura_expira_em = ? WHERE id = ?",
      [dataExpiracao, usuario_id]
    );

    res.json({ mensagem: "Assinatura liberada por 30 dias." });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao liberar assinatura." });
  }
});

export default router;