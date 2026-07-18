# AgendaSimples

Sistema de agendamentos para profissionais autônomos e pequenos negócios — barbeiros, esteticistas, personal trainers, professores e consultórios.

> **Demonstração de portfólio.** Todos os dados ficam apenas no navegador (`localStorage`). Não há backend, autenticação nem envio real de e-mail, SMS ou WhatsApp.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Sem backend](https://img.shields.io/badge/Backend-Nenhum-0f766e)

## Funcionalidades

| Módulo | O que faz |
|--------|-----------|
| **Dashboard** | Agendamentos de hoje, próximos atendimentos, total de clientes, faturamento previsto do mês, concluídos, cancelados e não comparecimentos |
| **Clientes** | CRUD completo, busca por nome/telefone, observações e histórico de agendamentos |
| **Serviços** | Nome, duração, preço e descrição com criar/editar/excluir |
| **Agendamentos** | Cliente, serviço, data, horário, duração, preço, status e observações |
| **Agenda** | Visões de dia, semana e lista, com filtros por cliente, serviço, status e data |
| **Conflitos** | Impede sobreposição (total ou parcial), explica o conflito e sugere horários livres |
| **Ações** | Criar, editar, remarcar, confirmar, concluir, cancelar, não compareceu e excluir |
| **Dados** | Persistência em `localStorage`, restauração de dados fictícios com confirmação |

### Status disponíveis

- Agendado  
- Confirmado  
- Concluído  
- Cancelado  
- Não compareceu  

Status **cancelado**, **concluído** e **não compareceu** não ocupam a agenda para fins de conflito (apenas **agendado** e **confirmado** bloqueiam o horário).

## Tecnologias

- HTML5 semântico  
- CSS3 moderno (variáveis, grid/flex, responsivo)  
- JavaScript puro (ES6+, sem frameworks)  
- `localStorage` para persistência local  

## Estrutura do projeto

```
agenda-simples/
├── index.html          # Interface principal
├── css/
│   └── styles.css      # Estilos e layout responsivo
├── js/
│   └── main.js         # Lógica da aplicação
└── README.md
```

## Como executar localmente

Não é necessário build nem instalação de dependências.

### Opção 1 — abrir o arquivo

Abra `index.html` diretamente no navegador.

> Em alguns navegadores o `localStorage` funciona normalmente em arquivos locais. Se preferir um servidor HTTP:

### Opção 2 — servidor estático

```bash
# Python 3
python -m http.server 5500

# Node (npx)
npx serve .
```

Acesse `http://localhost:5500` (ou a porta indicada).

## Deploy

O projeto é 100% estático e está pronto para hospedagem gratuita.

### Vercel

1. Importe o repositório no [Vercel](https://vercel.com).  
2. Framework Preset: **Other**.  
3. Build Command: (vazio) · Output Directory: `.`  
4. Deploy.

Ou via CLI:

```bash
npx vercel
```

### Netlify

1. Importe o repositório no [Netlify](https://netlify.com).  
2. Build command: (vazio)  
3. Publish directory: `.`  
4. Deploy.

Ou arraste a pasta do projeto em **Deploy manually**.

### GitHub Pages

1. Envie o repositório para o GitHub.  
2. Em **Settings → Pages**, escolha a branch `main` e a pasta `/ (root)`.  
3. Salve e aguarde a URL `https://<usuario>.github.io/<repositorio>/`.

Se o site for servido a partir de um subcaminho, não é necessário ajustar caminhos: os assets usam caminhos relativos (`css/styles.css`, `js/main.js`).

## Dados de demonstração

Na primeira visita, a aplicação carrega automaticamente clientes, serviços e agendamentos fictícios coerentes (salão/consultório misto), incluindo atendimentos de hoje, do passado e dos próximos dias.

No menu lateral, o botão **Restaurar dados fictícios** substitui tudo pelos dados de demo (com confirmação).

## Acessibilidade e UX

- Skip link para o conteúdo principal  
- Foco visível e navegação por teclado  
- Modais com `aria-modal`, labels e fechamento por `Esc`  
- Mensagens de erro em formulários e toasts de sucesso  
- Estados vazios com orientação  
- Menu mobile com overlay  
- Layout responsivo  

## Limitações (propositalmente)

- Sem multi-usuário ou login  
- Sem sincronização entre dispositivos  
- Sem notificações reais (e-mail/SMS/WhatsApp)  
- Dados apagados se o usuário limpar o armazenamento do site  

## Licença

Projeto demonstrativo para portfólio. Use e adapte livremente.
