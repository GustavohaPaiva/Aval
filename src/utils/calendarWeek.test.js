import { describe, expect, it } from 'vitest'
import {
  addDays,
  buildPrazoSemanaOptions,
  formatPrazoSemanaLabel,
  getCalendarWeek,
  isPrazoSemanaAllowed,
  minPrazoEntregaDate,
  minPrazoSemanaInicio,
  startOfWeekSunday,
  weekOfMonth,
} from './calendarWeek'

describe('calendarWeek', () => {
  it('calcula domingo–sábado da semana', () => {
    // 2026-08-09 é domingo
    expect(startOfWeekSunday('2026-08-09')).toBe('2026-08-09')
    // Ago/2026: 1ª semana = 26/jul–1/ago; 9–15/ago = 3ª semana
    expect(getCalendarWeek('2026-08-12')).toEqual({
      weekStart: '2026-08-09',
      weekEnd: '2026-08-15',
      label: '3ª semana de agosto',
      crossesMonth: false,
    })
  })

  it('conta 1ª semana a partir da semana que contém o dia 1', () => {
    // Ago/2026: dia 1 é sábado → semana 26/jul–1/ago
    expect(weekOfMonth('2026-08-01')).toBe(1)
    expect(weekOfMonth('2026-08-02')).toBe(2)
    expect(getCalendarWeek('2026-08-05').label).toBe('2ª semana de agosto')
  })

  it('rotula semana que cruza virada de mês', () => {
    // Dom 26/abr/2026 – sáb 2/mai/2026
    const week = getCalendarWeek('2026-04-28')
    expect(week).toMatchObject({
      weekStart: '2026-04-26',
      weekEnd: '2026-05-02',
      crossesMonth: true,
    })
    // Abr/2026: 1ª = 29/mar–4/abr; 26/abr–2/mai = 5ª de abr + 1ª de mai
    expect(week.label).toBe('5ª sem. abr / 1ª sem. mai')
  })

  it('rotula outra virada de mês (mar/abr)', () => {
    // Dom 29/mar/2026 – sáb 4/abr/2026
    const week = getCalendarWeek('2026-04-01')
    expect(week).toMatchObject({
      weekStart: '2026-03-29',
      weekEnd: '2026-04-04',
      crossesMonth: true,
      label: '5ª sem. mar / 1ª sem. abr',
    })
  })

  it('mínimo de 14 dias corridos a partir da criação', () => {
    expect(minPrazoEntregaDate('2026-08-09')).toBe('2026-08-23')
    expect(addDays('2026-08-09', 14)).toBe('2026-08-23')
    // 23/ago/2026 é domingo → semana mínima começa nesse dia
    expect(minPrazoSemanaInicio('2026-08-09')).toBe('2026-08-23')
  })

  it('primeira semana selecionável contém a data mínima mesmo no meio da semana', () => {
    // Criação sex 7/ago → mínimo 21/ago (sex) → semana 16–22/ago
    expect(minPrazoEntregaDate('2026-08-07')).toBe('2026-08-21')
    expect(minPrazoSemanaInicio('2026-08-07')).toBe('2026-08-16')
  })

  it('bloqueia semanas antes do mínimo para não-gestor', () => {
    expect(
      isPrazoSemanaAllowed('2026-08-16', {
        createdAt: '2026-08-09',
        isGestor: false,
      }),
    ).toBe(false)
    expect(
      isPrazoSemanaAllowed('2026-08-23', {
        createdAt: '2026-08-09',
        isGestor: false,
      }),
    ).toBe(true)
  })

  it('permite qualquer semana (domingo) para gestor', () => {
    expect(
      isPrazoSemanaAllowed('2026-08-09', {
        createdAt: '2026-08-09',
        isGestor: true,
      }),
    ).toBe(true)
    expect(
      isPrazoSemanaAllowed('2026-08-10', {
        createdAt: '2026-08-09',
        isGestor: true,
      }),
    ).toBe(false)
  })

  it('mantém semana já salva abaixo do mínimo para não-gestor', () => {
    expect(
      isPrazoSemanaAllowed('2026-08-09', {
        createdAt: '2026-08-09',
        isGestor: false,
        previousWeekStart: '2026-08-09',
      }),
    ).toBe(true)
  })

  it('lista opções a partir do mínimo para consultor e desde a criação para gestor', () => {
    const consultor = buildPrazoSemanaOptions({
      createdAt: '2026-08-09',
      isGestor: false,
      weekCount: 3,
    })
    expect(consultor.map((o) => o.value)).toEqual([
      '2026-08-23',
      '2026-08-30',
      '2026-09-06',
    ])
    expect(consultor[0].label).toBe('5ª semana de agosto')

    const gestor = buildPrazoSemanaOptions({
      createdAt: '2026-08-09',
      isGestor: true,
      weekCount: 3,
    })
    expect(gestor[0].value).toBe('2026-08-09')
    expect(gestor.some((o) => o.value === '2026-08-23')).toBe(true)
  })

  it('formatPrazoSemanaLabel reutiliza o rótulo', () => {
    expect(formatPrazoSemanaLabel('2026-04-26')).toBe('5ª sem. abr / 1ª sem. mai')
  })
})
