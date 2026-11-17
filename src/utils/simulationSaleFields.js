import { saoPauloDateOnly } from './autonomiaDesconto'
import { filialVendaForProfile } from './filialCodigo'

/**
 * Campos gravados só na criação. Safra não entra.
 * A edição de uma simulação existente não deve reenviar estes campos.
 */
export function newSimulationSaleFields(profile, now = new Date()) {
  return {
    data_negociacao: saoPauloDateOnly(now),
    filial_venda: filialVendaForProfile(profile),
    tipo_venda: 'reais',
    status_lancamento: 'lancado',
  }
}
