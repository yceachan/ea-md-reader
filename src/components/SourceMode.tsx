import { ToggleGroup } from '@appica/ui-react/toggle-group';
import { Toggle } from '@appica/ui-react/toggle';

export default function SourceMode({ editing, disabled, onChange }: { editing: boolean; disabled: boolean; onChange: (editing: boolean) => void }) {
  return <ToggleGroup className="source-mode" aria-label="Markdown 模式" value={[editing ? 'edit' : 'preview']} disabled={disabled} onValueChange={(value) => {
    if (value.length) onChange(value[0] === 'edit');
  }}>
    <Toggle className="source-mode-option" value="preview">预览</Toggle>
    <Toggle className="source-mode-option" value="edit">编辑</Toggle>
  </ToggleGroup>;
}
