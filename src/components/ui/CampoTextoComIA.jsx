import { forwardRef, useImperativeHandle, useState } from "react";
import { IconSparkles } from "../icons";
import { Button } from "./Button";
import { ButtonGroup } from "./ButtonGroup";
import { Modal } from "./Modal";
import { melhorarTextoPortugues } from "../../utils/textoPortuguesAssistant";

const textareaClass =
  "w-full resize-y rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export const CampoTextoComIA = forwardRef(function CampoTextoComIA(
  {
    label,
    value,
    onChange,
    rows = 4,
    placeholder,
    disabled = false,
    maxLinhas = 10,
    contexto = "simulacao",
    hideTrigger = false,
  },
  ref,
) {
  const [assistenteAberto, setAssistenteAberto] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const [sugerido, setSugerido] = useState("");
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [modo, setModo] = useState("editar");

  const abrirAssistente = () => {
    setRascunho(value || "");
    setSugerido("");
    setAviso("");
    setModo("editar");
    setAssistenteAberto(true);
  };

  useImperativeHandle(ref, () => ({
    abrirAssistente,
  }));

  const gerarSugestao = async () => {
    setCarregando(true);
    setAviso("");
    try {
      const resultado = await melhorarTextoPortugues(rascunho, {
        contexto,
        maxLinhas,
      });
      if (!resultado.sugerido && resultado.aviso) {
        setAviso(resultado.aviso);
        return;
      }
      setSugerido(resultado.sugerido || "");
      setAviso(resultado.aviso || "");
      setModo("revisar");
    } catch (e) {
      console.error(e);
      setAviso("Não foi possível gerar sugestão. Edite o texto manualmente.");
    } finally {
      setCarregando(false);
    }
  };

  const aplicar = (texto) => {
    onChange(String(texto ?? "").trim());
    setAssistenteAberto(false);
  };

  return (
    <>
      <div className="flex w-full flex-col gap-1.5">
        {(label || (!hideTrigger && !disabled)) && (
          <div className="flex min-h-8 items-center justify-between gap-3">
            {label ? (
              <label className="text-sm font-medium text-slate-700">
                {label}
              </label>
            ) : null}
            {!hideTrigger && !disabled ? (
              <Button
                type="button"
                variant="secondary"
                className={[
                  "h-8 shrink-0 px-2.5 text-xs",
                  label ? "" : "ml-auto",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={abrirAssistente}
                disabled={!String(value ?? "").trim()}
              >
                <IconSparkles className="size-3.5" />
                Corretor com IA
              </Button>
            ) : null}
          </div>
        )}
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          disabled={disabled}
          placeholder={placeholder}
          className={textareaClass}
        />
      </div>

      <Modal
        open={assistenteAberto}
        onClose={() => setAssistenteAberto(false)}
        title="Corretor com IA"
        size="lg"
        footer={
          modo === "editar" ? (
            <ButtonGroup>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAssistenteAberto(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={carregando}
                onClick={() => void gerarSugestao()}
                disabled={!rascunho.trim()}
              >
                <IconSparkles className="size-4" />
                Melhorar com IA
              </Button>
            </ButtonGroup>
          ) : (
            <ButtonGroup>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModo("editar")}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => aplicar(sugerido)}
                disabled={!sugerido.trim()}
              >
                Aplicar sugestão
              </Button>
            </ButtonGroup>
          )
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Correção com IA (Google Gemini) — revise antes de aplicar ao campo.
          </p>

          {modo === "editar" ? (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Texto original
              </label>
              <textarea
                rows={rows}
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                className={textareaClass}
              />
            </div>
          ) : (
            <>
              {aviso ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                  {aviso}
                </p>
              ) : null}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Sugestão
                </label>
                <textarea
                  rows={rows}
                  value={sugerido}
                  onChange={(e) => setSugerido(e.target.value)}
                  className={textareaClass}
                />
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
});

export function BotaoAssistenteIA({
  onClick,
  disabled = false,
  className = "",
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      className={["h-9 w-full px-3 sm:w-auto", className]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      disabled={disabled}
    >
      <IconSparkles className="size-4" />
      Corretor com IA
    </Button>
  );
}
