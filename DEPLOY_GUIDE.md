# 🚀 Guia de Publicação - ComparaInvest

Este guia mostra como publicar seu aplicativo ComparaInvest na internet gratuitamente usando **Vercel**.

---

## 📋 Pré-requisitos

✅ Git já configurado (concluído)
✅ Código commitado localmente (concluído)

Agora você precisa:
- [ ] Conta no GitHub
- [ ] Conta no Vercel

---

## 🔧 Passo 1: Criar Repositório no GitHub

### 1.1 Criar conta no GitHub (se ainda não tem)
1. Acesse: https://github.com
2. Clique em "Sign up"
3. Siga as instruções para criar sua conta gratuita

### 1.2 Criar novo repositório
1. Faça login no GitHub
2. Clique no botão **"+"** no canto superior direito
3. Selecione **"New repository"**
4. Configure:
   - **Repository name**: `ComparaInvest`
   - **Description**: "Simulador de Investimentos com IR Regressivo"
   - **Visibility**: Public (ou Private, se preferir)
   - ❌ **NÃO** marque "Initialize this repository with a README"
5. Clique em **"Create repository"**

### 1.3 Conectar seu código local ao GitHub

Após criar o repositório, o GitHub mostrará uma página com comandos. 

**IMPORTANTE**: Substitua `SEU_USUARIO` pelo seu nome de usuário do GitHub nos comandos abaixo.

Abra o terminal na pasta do projeto e execute:

```bash
# Adicionar o repositório remoto (SUBSTITUA SEU_USUARIO)
git remote add origin https://github.com/SEU_USUARIO/ComparaInvest.git

# Enviar o código para o GitHub
git push -u origin main
```

**Exemplo**: Se seu usuário for `joaosilva`, o comando seria:
```bash
git remote add origin https://github.com/joaosilva/ComparaInvest.git
```

---

## 🌐 Passo 2: Deploy na Vercel (GRATUITO)

### 2.1 Criar conta na Vercel
1. Acesse: https://vercel.com
2. Clique em **"Sign Up"**
3. Escolha **"Continue with GitHub"** (recomendado)
4. Autorize a Vercel a acessar sua conta do GitHub

### 2.2 Importar seu projeto
1. No dashboard da Vercel, clique em **"Add New..."** → **"Project"**
2. Encontre o repositório **"ComparaInvest"** na lista
3. Clique em **"Import"**

### 2.3 Configurar o projeto
A Vercel detectará automaticamente que é um projeto Vite/React. Confirme as configurações:

- **Framework Preset**: Vite
- **Root Directory**: `./` (deixe como está)
- **Build Command**: `npm run build` (já preenchido)
- **Output Directory**: `dist` (já preenchido)

### 2.4 Deploy!
1. Clique em **"Deploy"**
2. Aguarde 1-2 minutos enquanto a Vercel:
   - Instala as dependências
   - Compila o projeto
   - Publica online

### 2.5 Acessar seu app
Após o deploy, você verá:
- ✅ **Seu app está no ar!**
- 🔗 URL pública: `https://compara-invest-XXXXX.vercel.app`

---

## 🎯 Atualizações Futuras

Sempre que você quiser atualizar o app publicado:

1. Faça suas alterações no código
2. Commit as mudanças:
   ```bash
   git add .
   git commit -m "Descrição da mudança"
   ```
3. Envie para o GitHub:
   ```bash
   git push
   ```
4. **A Vercel fará o deploy automaticamente!** 🎉

---

## 🔧 Configurações Opcionais

### Domínio Personalizado
Você pode usar um domínio próprio (ex: `comparainvest.com.br`):
1. No dashboard da Vercel, vá em **Settings** → **Domains**
2. Adicione seu domínio
3. Configure os DNS conforme instruções da Vercel

### Variáveis de Ambiente
Se precisar de chaves de API ou configurações secretas:
1. No dashboard da Vercel, vá em **Settings** → **Environment Variables**
2. Adicione suas variáveis
3. Faça redeploy

---

## 📱 Alternativas à Vercel

Se preferir outras plataformas (também gratuitas):

### **Netlify**
1. Acesse: https://netlify.com
2. "Add new site" → "Import an existing project"
3. Conecte ao GitHub e selecione o repositório
4. Deploy!

### **GitHub Pages** (apenas para sites estáticos)
1. No repositório do GitHub, vá em **Settings** → **Pages**
2. Source: "GitHub Actions"
3. Crie um workflow de deploy (mais técnico)

---

## ❓ Problemas Comuns

### "Failed to compile"
- Verifique se não há erros no código
- Rode `npm run build` localmente para testar

### "Module not found"
- Certifique-se de que todas as dependências estão no `package.json`
- Rode `npm install` localmente

### "API calls failing"
- Verifique se as APIs do Banco Central estão acessíveis
- Considere adicionar tratamento de erro para APIs externas

---

## 🎉 Pronto!

Seu aplicativo **ComparaInvest** estará acessível globalmente em poucos minutos!

**URL de exemplo**: `https://compara-invest-seu-usuario.vercel.app`

Compartilhe com amigos, clientes ou portfólio! 🚀

---

## 📞 Suporte

- **Vercel Docs**: https://vercel.com/docs
- **GitHub Docs**: https://docs.github.com
- **Vite Docs**: https://vitejs.dev

---

**Desenvolvido com ❤️ usando React + TypeScript + Vite**
