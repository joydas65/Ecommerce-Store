import React from 'react'
import { TextField, Grid } from '@material-ui/core'
import { useFormContext, Controller } from 'react-hook-form'

const FormInput = ({ name, label, required, type = 'text', disabled = false }) => {
    const { control } = useFormContext()
    return (
        <Grid item xs={12} sm={6}>
            <Controller as={TextField} control={control} fullWidth id={name} name={name} label={label} required={required} type={type} disabled={disabled} />
        </Grid>
    )
}

export default FormInput
