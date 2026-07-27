

interface ProjectCreditCalloutProps {
  heading: string;
  text: string;
}

export function ProjectCreditCallout({ heading, text }: ProjectCreditCalloutProps) {
  return (
    <div className="nl-credit-callout">
      <p className="nl-credit-heading">
        <StarIcon />
        {heading}
      </p>
      <p className="nl-credit-text">{text}</p>
    </div>
  );
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.5l2.7 6.3 6.8.6-5.2 4.5 1.6 6.6L12 16.8l-5.9 3.7 1.6-6.6-5.2-4.5 6.8-.6L12 2.5z"
        fill="currentColor"
      />
    </svg>
  );
}
