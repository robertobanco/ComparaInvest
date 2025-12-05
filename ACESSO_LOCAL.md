# 🌐 Como Acessar a Aplicação Localmente

## 📍 Porta do Servidor Local

A aplicação **ComparaInvest** roda por padrão na porta **5173** quando você executa o servidor de desenvolvimento.

## 🚀 Como Iniciar o Servidor Local

1. **Abra o terminal** na pasta do projeto:
   ```bash
   cd c:\Antigravity\ComparaInvest\investment-app
   ```

2. **Execute o comando de desenvolvimento**:
   ```bash
   npm run dev
   ```

3. **Acesse no navegador**:
   ```
   http://localhost:5173
   ```

## 🔍 Onde Consultar a Porta

Quando você executa `npm run dev`, o Vite exibe no terminal a URL exata onde a aplicação está rodando. Você verá algo como:

```
  VITE v7.2.2  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

## 📝 Informações Adicionais

- **Framework**: Vite + React + TypeScript
- **Porta padrão**: 5173
- **Comando dev**: `npm run dev`
- **Comando build**: `npm run build`
- **Comando preview**: `npm run preview` (para testar a build de produção)

## 🔧 Alterando a Porta (Opcional)

Se você precisar usar uma porta diferente, pode modificar o arquivo `vite.config.ts`:

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000, // Sua porta personalizada
  },
})
```

## ✅ Status Atual

- ✅ Alterações commitadas
- ✅ Push realizado para o GitHub (branch main)
- ✅ Repositório: https://github.com/robertobanco/ComparaInvest.git
- ✅ Último commit: "Atualização de UI e correções de funcionalidade"
