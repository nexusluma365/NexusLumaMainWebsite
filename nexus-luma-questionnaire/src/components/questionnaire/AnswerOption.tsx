import { Check } from "lucide-react";
import type { QuestionOption } from "../../types/questionnaire";

interface AnswerOptionProps {
  option: QuestionOption;
  isSelected: boolean;
  disabled: boolean;
  onSelect: (option: QuestionOption) => void;
}

export function AnswerOption({ option, isSelected, disabled, onSelect }: AnswerOptionProps) {
  return (
    <button
      type="button"
      className="nq-option"
      aria-pressed={isSelected}
      disabled={disabled}
      onClick={() => onSelect(option)}
    >
      <span className="nq-option__label">{option.label}</span>
      <span className="nq-option__check" aria-hidden="true">
        <Check size={14} strokeWidth={3} />
      </span>
    </button>
  );
}
