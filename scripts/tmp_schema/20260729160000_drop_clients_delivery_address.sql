-- Remove endereço detalhado de entrega (ViaCEP / pedido CIF).
-- Localização do pedido passa a residir apenas em simulations
-- (fazenda, pedido_municipio, pedido_uf, prazo_dias).

ALTER TABLE public.clients
  DROP COLUMN IF EXISTS cep,
  DROP COLUMN IF EXISTS logradouro,
  DROP COLUMN IF EXISTS bairro;

COMMENT ON TABLE public.clients IS
  'Clientes comerciais; endereço detalhado de entrega no pedido foi removido — local do pedido fica em simulations (fazenda, pedido_municipio, pedido_uf).';
