import{t as e}from"./supabase-Bn7JdTdc.js";import{i as t}from"./pedidoAssinaturaService-DP-X594k.js";import{t as n}from"./simulationStatus-DixdCWem.js";var r=`
  id,
  created_at,
  status,
  ativo,
  fazenda,
  pedido_municipio,
  pedido_uf,
  prazo_semana_inicio,
  tipo_frete,
  origem_frete,
  destino_frete,
  observacoes,
  clients ( id, nome, municipio, uf ),
  pedido_assinaturas ( id, status, signed_at, signer_name, pdf_signed_path )
`;function i(e){return Array.isArray(e)?e[0]:e}function a(e){return(Array.isArray(e.pedido_assinaturas)?e.pedido_assinaturas:e.pedido_assinaturas?[e.pedido_assinaturas]:[]).filter(e=>e?.status===`signed`).sort((e,t)=>String(t.signed_at??``).localeCompare(String(e.signed_at??``)))[0]??null}function o(e){let t=i(e.clients),n=a(e);return{simulationId:String(e.id),createdAt:e.created_at?String(e.created_at):null,assinado:!!n,assinaturaId:n?.id??null,signedAt:n?.signed_at?String(n.signed_at):null,signerName:n?.signer_name??null,pdfSignedPath:n?.pdf_signed_path??null,clientNome:t?.nome?String(t.nome):`—`,fazenda:e.fazenda??null,municipio:e.pedido_municipio??t?.municipio??null,uf:e.pedido_uf??t?.uf??null,prazoSemanaInicio:e.prazo_semana_inicio==null?null:String(e.prazo_semana_inicio).slice(0,10),tipoFrete:e.tipo_frete??null,origemFrete:e.origem_frete??null,destinoFrete:e.destino_frete??null,observacoes:e.observacoes??null,ativo:e.ativo!==!1,status:e.status}}async function s(t={}){let i=e(),a=(t.search??``).trim(),{data:s,error:c}=await i.from(`simulations`).select(r).in(`status`,n).order(`created_at`,{ascending:!1});if(c)return{ok:!1,error:c.message};let l=(s??[]).map(o);if(a){let e=a.toLowerCase();l=l.filter(t=>[t.clientNome,t.fazenda,t.municipio,t.uf].filter(Boolean).join(` `).toLowerCase().includes(e))}return{ok:!0,data:l}}async function c(t){let i=e();if(!t)return{ok:!1,error:`Pedido não informado.`};let{data:a,error:s}=await i.from(`simulations`).select(r).eq(`id`,t).in(`status`,n).maybeSingle();return s?{ok:!1,error:s.message}:a?{ok:!0,data:o(a)}:{ok:!1,error:`Pedido não encontrado.`}}async function l(e){return t(e)}export{c as n,s as r,l as t};