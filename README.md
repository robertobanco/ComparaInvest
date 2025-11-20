# Comparador de Investimentos

Este aplicativo permite comparar a rentabilidade de um Fundo Exclusivo (1% a 2% a.m.) contra investimentos tradicionais de mercado (CDB, LCI, Poupança).

## Funcionalidades

- **Simulador de Fundo**:
  - Taxa ajustável de 1.0% a 2.0% a.m.
  - **Modo Pagamento Mensal**: Simula a retirada mensal dos rendimentos (Juros Simples).
  - **Modo Reinvestimento**: Simula o juro sobre juro (Juros Compostos).
- **Comparativos de Mercado**:
  - CDB (110% do CDI)
  - LCI/LCA (90% do CDI - Isento de IR)
  - Poupança (Regra nova/velha)
- **Cálculo de Impostos**: Tabela regressiva de IR automática (22.5% a 15%).

## Como Rodar

> **Nota Importante**: Este projeto está salvo no Google Drive (`G:\`). O `npm install` pode falhar devido a limitações do sistema de arquivos do Drive.
> Recomendamos mover a pasta `investment-app` para `C:\Projetos\` ou similar antes de rodar.

1. Abra o terminal na pasta do projeto:
   ```bash
   cd investment-app
   ```

2. Instale as dependências (se ainda não instalou):
   ```bash
   npm install
   ```

3. Rode o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

4. Acesse `http://localhost:5173` no navegador.

## Tecnologias

- React + Vite
- TypeScript
- TailwindCSS
- Lucide React (Ícones)
