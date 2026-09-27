# Identidade Lockeris

**Nome:** Lockeris

**Slogan:** Plataforma Integrada de Alocação e Armários

**Assinatura compacta na barra lateral:** Gestão de Armários

O símbolo 2D representa duas portas planas, branca e verde menta, sobre um quadrado violeta de cantos arredondados. O arquivo principal é `apps/web/public/icon.svg`, usado pelo manifesto PWA, pela navegação e pela tela de acesso.

| Uso | Claro | Escuro |
| --- | --- | --- |
| Fundo da aplicação | `#FAFAFA` | `#18181B` |
| Cartões | `#FFFFFF` | `#27272A` |
| Bordas | `#E4E4E7` | `#3F3F46` |

- **Marca:** `#7C3AED` (violeta) e `#2E1065` (roxo profundo).
- **Disponível e sucesso:** `#34D399` e `#10B981` (verde menta).
- **Pendências:** `#FBBF24` e `#F59E0B` (amarelo).
- **Ocupado e perigo:** `#F43F5E` e `#E11D48` (rosa).

Os tokens de cor ficam em `apps/web/src/design-system.css` e `apps/web/src/theme.css`. `operational-design.css` estiliza a navegação e as telas de operação; `locker-status.css` define as cores dos estados dos armários. Cada estado conserva texto e ícone para não depender apenas da cor.
