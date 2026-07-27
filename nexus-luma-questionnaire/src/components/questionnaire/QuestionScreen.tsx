import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { QuestionOption, QuestionnaireQuestion } from "../../types/questionnaire";
import { AnswerOption } from "./AnswerOption";

interface QuestionScreenProps {
  question: QuestionnaireQuestion;
  savedAnswerValue?: string;
  onSelect: (option: QuestionOption) => void;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
}

const screenVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export function QuestionScreen({ question, savedAnswerValue, onSelect, headingRef }: QuestionScreenProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    question.options.find((o) => o.value === savedAnswerValue)?.id ?? null
  );
  const [locked, setLocked] = useState(false);
  const hasFired = useRef(false);

  useEffect(() => {
    setSelectedOptionId(question.options.find((o) => o.value === savedAnswerValue)?.id ?? null);
    setLocked(false);
    hasFired.current = false;
  }, [question.id, savedAnswerValue, question.options]);

  const handleSelect = (option: QuestionOption) => {
    if (locked || hasFired.current) return;
    hasFired.current = true;
    setSelectedOptionId(option.id);
    setLocked(true);
    onSelect(option);
  };

  return (
    <motion.div
      variants={screenVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <h2 className="nq-headline" tabIndex={-1} ref={headingRef}>
        {question.headline}
      </h2>
      {question.supportingText && <p className="nq-supporting-text">{question.supportingText}</p>}
      <div className="nq-options" role="group" aria-label={question.headline}>
        {question.options.map((option) => (
          <AnswerOption
            key={option.id}
            option={option}
            isSelected={selectedOptionId === option.id}
            disabled={locked}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </motion.div>
  );
}
