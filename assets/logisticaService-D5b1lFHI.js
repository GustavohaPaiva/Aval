import{t as e}from"./supabase-Bn7JdTdc.js";import{i as t}from"./pedidoAssinaturaService-Dd1cY2K_.js";async function n(t={}){let n=e(),r=(t.search??``).trim(),{data:i,error:a}=await n.from(`pedido_assinaturas`).select(`
      id,
      simulation_id,
      signed_at,
      signer_name,
      pdf_signed_path,
      simulations (
        id,
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
        clients ( id, nome )
      )
    `).eq(`status`,`signed`).order(`signed_at`,{ascending:!1});if(a)return{ok:!1,error:a.message};let o=new Map;for(let e of i??[]){let t=e.simulation_id;if(!t||o.has(t))continue;let n=e.simulations,r=Array.isArray(n)?n[0]:n;if(!r)continue;let i=r.clients,a=Array.isArray(i)?i[0]:i;o.set(t,{assinaturaId:e.id,simulationId:String(t),signedAt:e.signed_at?String(e.signed_at):null,signerName:e.signer_name??null,pdfSignedPath:e.pdf_signed_path??null,clientNome:a?.nome?String(a.nome):`—`,fazenda:r.fazenda??null,municipio:r.pedido_municipio??null,uf:r.pedido_uf??null,prazoSemanaInicio:r.prazo_semana_inicio==null?null:String(r.prazo_semana_inicio).slice(0,10),tipoFrete:r.tipo_frete??null,origemFrete:r.origem_frete??null,destinoFrete:r.destino_frete??null,observacoes:r.observacoes??null,ativo:r.ativo!==!1,status:r.status})}let s=[...o.values()];if(r){let e=r.toLowerCase();s=s.filter(t=>[t.clientNome,t.fazenda,t.municipio,t.uf].filter(Boolean).join(` `).toLowerCase().includes(e))}return{ok:!0,data:s}}async function r(t){let n=e();if(!t)return{ok:!1,error:`Pedido não informado.`};let{data:r,error:i}=await n.from(`pedido_assinaturas`).select(`id, simulation_id, signed_at, signer_name, pdf_signed_path, status`).eq(`simulation_id`,t).eq(`status`,`signed`).order(`signed_at`,{ascending:!1}).limit(1).maybeSingle();if(i)return{ok:!1,error:i.message};if(!r)return{ok:!1,error:`Pedido assinado não encontrado.`};let{data:a,error:o}=await n.from(`simulations`).select(`
      id,
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
      clients ( id, nome, municipio, uf )
    `).eq(`id`,t).maybeSingle();if(o)return{ok:!1,error:o.message};if(!a)return{ok:!1,error:`Pedido não encontrado.`};let s=a.clients,c=Array.isArray(s)?s[0]:s;return{ok:!0,data:{assinaturaId:r.id,simulationId:String(a.id),signedAt:r.signed_at?String(r.signed_at):null,signerName:r.signer_name??null,pdfSignedPath:r.pdf_signed_path??null,clientNome:c?.nome?String(c.nome):`—`,fazenda:a.fazenda??null,municipio:a.pedido_municipio??c?.municipio??null,uf:a.pedido_uf??c?.uf??null,prazoSemanaInicio:a.prazo_semana_inicio==null?null:String(a.prazo_semana_inicio).slice(0,10),tipoFrete:a.tipo_frete??null,origemFrete:a.origem_frete??null,destinoFrete:a.destino_frete??null,observacoes:a.observacoes??null,ativo:a.ativo!==!1,status:a.status}}}async function i(e){return t(e)}export{r as n,n as r,i as t};