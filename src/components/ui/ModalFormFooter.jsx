import { Button } from "./Button";
import { ButtonGroup } from "./ButtonGroup";

export function ModalFormFooter({
  formId,
  submitLabel = "Salvar",
  cancelLabel = "Cancelar",
  loading = false,
  disabled = false,
  onCancel,
}) {
  return (
    <ButtonGroup>
      <Button
        type="button"
        variant="secondary"
        disabled={loading || disabled}
        onClick={onCancel}
      >
        {cancelLabel}
      </Button>
      <Button
        type="submit"
        form={formId}
        loading={loading}
        disabled={disabled}
      >
        {submitLabel}
      </Button>
    </ButtonGroup>
  );
}
