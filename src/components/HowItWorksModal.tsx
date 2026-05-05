import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";

interface HowItWorksModalProps {
  open: boolean;
  onClose: () => void;
  onSignUp?: () => void;
}

interface StepConfig {
  icon: () => import("solid-js").JSX.Element;
  badge: string;
  title: string;
  description: string;
}

function SearchMarketIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect x="8" y="12" width="48" height="40" rx="8" fill="#EEF2FF" stroke="#6366F1" stroke-width="2" />
      <rect x="14" y="20" width="36" height="6" rx="3" fill="#C7D2FE" />
      <rect x="14" y="30" width="24" height="4" rx="2" fill="#E0E7FF" />
      <rect x="14" y="38" width="30" height="4" rx="2" fill="#E0E7FF" />
      <circle cx="48" cy="44" r="10" fill="#6366F1" />
      <path d="M45 44l2 2 4-4" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function PredictIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect x="10" y="14" width="44" height="36" rx="8" fill="#ECFDF5" stroke="#10B981" stroke-width="2" />
      <rect x="16" y="22" width="14" height="20" rx="4" fill="#10B981" />
      <text x="23" y="36" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">Y</text>
      <rect x="34" y="28" width="14" height="14" rx="4" fill="#FCA5A5" />
      <text x="41" y="39" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">N</text>
      <path d="M20 48l6-4 6 2 6-6 6 3" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function EarnIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="22" fill="#FEF3C7" stroke="#F59E0B" stroke-width="2" />
      <circle cx="32" cy="32" r="15" fill="#FDE68A" />
      <text x="32" y="37" font-size="16" font-weight="800" fill="#B45309" text-anchor="middle">$</text>
      <path d="M18 14l-4-6" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" />
      <path d="M46 14l4-6" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" />
      <path d="M32 6v4" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" />
      <path d="M14 28l-4-1" stroke="#F59E0B" stroke-width="1.5" stroke-linecap="round" />
      <path d="M50 28l4-1" stroke="#F59E0B" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 3.5L10.5 8 6 12.5"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10.5 3.5L6 8 10.5 12.5"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

const STEPS: StepConfig[] = [
  {
    icon: SearchMarketIcon,
    badge: "Step 1",
    title: "Discover Events",
    description:
      "Browse prediction markets across politics, crypto, sports, and more. Each event has clear outcomes you can trade on — find the ones you know best.",
  },
  {
    icon: PredictIcon,
    badge: "Step 2",
    title: "Make Your Prediction",
    description:
      "Buy Yes or No shares on any outcome. Shares are priced between $0 and $1 — the lower the price, the higher the potential return if you're right.",
  },
  {
    icon: EarnIcon,
    badge: "Step 3",
    title: "Earn Returns",
    description:
      "When the event resolves, winning shares pay out $1 each. Sell anytime before resolution if the odds move in your favor — you're always in control.",
  },
];

const TOTAL_STEPS = STEPS.length;

export default function HowItWorksModal(props: HowItWorksModalProps) {
  const [currentStep, setCurrentStep] = createSignal(0);

  createEffect(() => {
    if (!props.open || typeof document === "undefined") {
      return;
    }

    setCurrentStep(0);

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        setCurrentStep(step => Math.min(step + 1, TOTAL_STEPS - 1));
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        setCurrentStep(step => Math.max(step - 1, 0));
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    });
  });

  const isFirstStep = () => currentStep() === 0;
  const isLastStep = () => currentStep() === TOTAL_STEPS - 1;
  const step = () => STEPS[currentStep()];

  const handleNext = () => {
    if (isLastStep()) {
      props.onClose();
      props.onSignUp?.();
      return;
    }

    setCurrentStep(s => s + 1);
  };

  const handleBack = () => {
    setCurrentStep(s => Math.max(s - 1, 0));
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div class="pm-hiw-modal__overlay" onClick={props.onClose}>
          <section
            class="pm-hiw-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pm-hiw-modal-title"
            onClick={event => event.stopPropagation()}
          >
            {/* Close button */}
            <button
              class="pm-hiw-modal__close"
              type="button"
              aria-label="Close"
              onClick={props.onClose}
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M12 4L4 12M4 4l8 8"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </button>

            {/* Progress dots */}
            <div class="pm-hiw-modal__progress" role="tablist" aria-label="Steps">
              {STEPS.map((_, index) => (
                <button
                  type="button"
                  role="tab"
                  class="pm-hiw-modal__dot"
                  classList={{
                    "pm-hiw-modal__dot--active": index === currentStep(),
                    "pm-hiw-modal__dot--completed": index < currentStep(),
                  }}
                  aria-label={`Step ${index + 1}`}
                  aria-selected={index === currentStep()}
                  onClick={() => setCurrentStep(index)}
                />
              ))}
            </div>

            {/* Step content */}
            <div class="pm-hiw-modal__content">
              <div class="pm-hiw-modal__icon-wrap">
                <div class="pm-hiw-modal__icon-glow" />
                {step().icon({})}
              </div>

              <span class="pm-hiw-modal__badge">{step().badge}</span>

              <h2 class="pm-hiw-modal__title" id="pm-hiw-modal-title">
                {step().title}
              </h2>

              <p class="pm-hiw-modal__description">{step().description}</p>
            </div>

            {/* Navigation */}
            <div class="pm-hiw-modal__actions">
              <Show
                when={!isFirstStep()}
                fallback={<div class="pm-hiw-modal__action-spacer" />}
              >
                <button
                  class="pm-hiw-modal__back"
                  type="button"
                  onClick={handleBack}
                >
                  <ChevronLeftIcon />
                  <span>Back</span>
                </button>
              </Show>

              <button
                class="pm-hiw-modal__next"
                type="button"
                onClick={handleNext}
              >
                <span>{isLastStep() ? "Get Started" : "Next"}</span>
                <Show when={!isLastStep()}>
                  <ChevronRightIcon />
                </Show>
              </button>
            </div>
          </section>
        </div>
      </Portal>
    </Show>
  );
}
