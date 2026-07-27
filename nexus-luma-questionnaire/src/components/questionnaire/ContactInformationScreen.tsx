import { useState } from "react";
import type { FormEvent } from "react";
import { motion } from "framer-motion";
import type { ContactFieldRequirements, ContactInformation } from "../../types/questionnaire";
import {
  normalizeUrl,
  sanitizeText,
  validateBusinessName,
  validateEmail,
  validateFirstName,
  validatePhone,
  validateWebsiteUrl,
} from "../../utils/validation";

interface ContactInformationScreenProps {
  requirements: ContactFieldRequirements;
  isSubmitting: boolean;
  onSubmit: (contact: ContactInformation) => void;
}

interface FormValues {
  firstName: string;
  email: string;
  phone: string;
  businessName: string;
  websiteUrl: string;
}

interface FormErrors {
  firstName?: string;
  email?: string;
  phone?: string;
  businessName?: string;
  websiteUrl?: string;
}

const initialValues: FormValues = {
  firstName: "",
  email: "",
  phone: "",
  businessName: "",
  websiteUrl: "",
};

export function ContactInformationScreen({ requirements, isSubmitting, onSubmit }: ContactInformationScreenProps) {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});

  const updateField = (field: keyof FormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const firstNameResult = validateFirstName(values.firstName, requirements.firstName);
    const emailResult = validateEmail(values.email, requirements.email);
    const phoneResult = validatePhone(values.phone, requirements.phone);
    const businessNameResult = validateBusinessName(values.businessName, requirements.businessName);
    const websiteUrlResult = validateWebsiteUrl(values.websiteUrl, requirements.websiteUrl);

    const nextErrors: FormErrors = {
      firstName: firstNameResult.valid ? undefined : firstNameResult.message,
      email: emailResult.valid ? undefined : emailResult.message,
      phone: phoneResult.valid ? undefined : phoneResult.message,
      businessName: businessNameResult.valid ? undefined : businessNameResult.message,
      websiteUrl: websiteUrlResult.valid ? undefined : websiteUrlResult.message,
    };
    setErrors(nextErrors);

    const hasErrors = Object.values(nextErrors).some(Boolean);
    if (hasErrors) return;

    const contact: ContactInformation = {
      firstName: sanitizeText(values.firstName),
      email: sanitizeText(values.email),
      phone: values.phone.trim() ? sanitizeText(values.phone) : undefined,
      businessName: values.businessName.trim() ? sanitizeText(values.businessName) : undefined,
      websiteUrl: values.websiteUrl.trim() ? normalizeUrl(sanitizeText(values.websiteUrl)) : undefined,
    };

    onSubmit(contact);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{ display: "flex", flexDirection: "column", flex: 1 }}
    >
      <h2 className="nq-headline" tabIndex={-1}>
        Your Recommendation Is Ready
      </h2>
      <p className="nq-supporting-text">
        Enter your information so we can save your results and show your best next step.
      </p>

      <form className="nq-form" onSubmit={handleSubmit} noValidate>
        <div className="nq-form__fields">
          <Field
            id="nq-first-name"
            label="First name"
            required={requirements.firstName}
            type="text"
            autoComplete="given-name"
            value={values.firstName}
            error={errors.firstName}
            onChange={(v) => updateField("firstName", v)}
          />
          <Field
            id="nq-email"
            label="Email address"
            required={requirements.email}
            type="email"
            autoComplete="email"
            value={values.email}
            error={errors.email}
            onChange={(v) => updateField("email", v)}
          />
          <Field
            id="nq-phone"
            label="Phone number"
            required={requirements.phone}
            type="tel"
            autoComplete="tel"
            value={values.phone}
            error={errors.phone}
            onChange={(v) => updateField("phone", v)}
          />
          <Field
            id="nq-business-name"
            label="Business name"
            required={requirements.businessName}
            type="text"
            autoComplete="organization"
            value={values.businessName}
            error={errors.businessName}
            onChange={(v) => updateField("businessName", v)}
          />
          <Field
            id="nq-website-url"
            label="Website URL"
            required={requirements.websiteUrl}
            type="text"
            autoComplete="url"
            value={values.websiteUrl}
            error={errors.websiteUrl}
            onChange={(v) => updateField("websiteUrl", v)}
            placeholder="yourbusiness.com"
          />
        </div>

        <div className="nq-form__footer">
          <button type="submit" className="nq-button nq-button--primary" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <span className="nq-button__spinner" aria-hidden="true" />
                Saving Your Results...
              </>
            ) : (
              "Show My Recommendation"
            )}
          </button>
        </div>
      </form>
    </motion.div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  required: boolean;
  type: string;
  autoComplete: string;
  value: string;
  error?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

function Field({ id, label, required, type, autoComplete, value, error, placeholder, onChange }: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="nq-field">
      <label htmlFor={id} className="nq-field__label">
        {label} {!required && <span className="nq-field__optional">(optional)</span>}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        className="nq-field__input"
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p id={errorId} className="nq-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
