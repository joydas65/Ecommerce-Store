'use client';

import { TextField, Grid } from '@mui/material';
import { useFormContext, Controller } from 'react-hook-form';

const FormInput = ({ name, label, required, type = 'text', disabled = false }) => {
  const { control } = useFormContext();

  return (
    <Grid size={{ xs: 12, sm: 6 }}>
      <Controller
        control={control}
        name={name}
        rules={{ required: required ? `${label} is required.` : false }}
        render={({ field: { ref, ...field }, fieldState }) => (
          <TextField
            {...field}
            inputRef={ref}
            fullWidth
            id={name}
            label={label}
            required={required}
            type={type}
            disabled={disabled}
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
          />
        )}
      />
    </Grid>
  );
};

export default FormInput;
