import React from "react";
import { Spinner as InkSpinner } from "@inkjs/ui";

type SpinnerProps = {
  label: string;
};

export const Spinner: React.FC<SpinnerProps> = ({ label }) => <InkSpinner label={label} />;
