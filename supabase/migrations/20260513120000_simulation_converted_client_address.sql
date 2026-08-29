-- Status de simulação após conversão em pedido (PDF / fluxo comercial)
ALTER TYPE public.simulation_status ADD VALUE IF NOT EXISTS 'converted';

-- Endereço detalhado do cliente (ViaCEP / pedido)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS municipio text,
  ADD COLUMN IF NOT EXISTS uf text;

COMMENT ON COLUMN public.clients.cep IS 'CEP (apenas dígitos ou formatado); preenchimento via ViaCEP na UI.';

-- Produtos seed com IDs fixos (alinhados ao catálogo do Simulador no frontend)
INSERT INTO public.products (id, nome, cultura, preco_base, ativo)
VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01'::uuid, 'Soja RR', 'Soja', 118.50, true),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02'::uuid, 'Milho safrinha', 'Milho', 72.00, true),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03'::uuid, 'Algodão caroço', 'Algodão', 165.25, true)
ON CONFLICT (id) DO UPDATE SET
  nome = excluded.nome,
  cultura = excluded.cultura,
  preco_base = excluded.preco_base,
  ativo = excluded.ativo,
  updated_at = now();
