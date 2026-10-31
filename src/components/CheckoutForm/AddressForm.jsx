import React, { useState, useEffect, useRef } from 'react';
import { InputLabel, Select, MenuItem, Button, Grid, Typography } from '@material-ui/core';
import { useForm, FormProvider } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { commerce } from '../../lib/commerce';
import FormInput from './CustomTextField';

const AddressForm = ({ checkoutToken, shippingData = {}, onSubmit, isSubmitting = false, error = '' }) => {
  const savedAddress = useRef(shippingData).current;
  const [countries, setCountries] = useState({ choices: {}, loading: true, error: '' });
  const [shippingCountry, setShippingCountry] = useState('');
  const [regions, setRegions] = useState(null);
  const [options, setOptions] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const methods = useForm({
    defaultValues: { firstName: '', lastName: '', address1: '', email: '', city: '', zip: '', ...shippingData },
  });
  const submitting = isSubmitting || methods.formState.isSubmitting;

  useEffect(() => {
    let active = true;
    setCountries({ choices: {}, loading: true, error: '' });
    setShippingCountry('');

    const loadCountries = async () => {
      try {
        const { countries: choices } = await commerce.services.localeListShippingCountries(checkoutToken.id);
        if (!active) return;
        const codes = Object.keys(choices);
        setCountries({ choices, loading: false, error: codes.length ? '' : 'No shipping destinations are available.' });
        setShippingCountry(codes.includes(savedAddress.shippingCountry) ? savedAddress.shippingCountry : codes[0] || '');
      } catch {
        if (active) setCountries({ choices: {}, loading: false, error: 'Unable to load shipping countries. Please try again.' });
      }
    };

    loadCountries();
    return () => { active = false; };
  }, [checkoutToken.id, savedAddress, retryCount]);

  useEffect(() => {
    let active = true;
    setRegions(null);
    setOptions(null);
    if (!shippingCountry) return () => { active = false; };

    const loadRegions = async () => {
      try {
        const { subdivisions: choices } = await commerce.services.localeListSubdivisions(shippingCountry);
        if (!active) return;
        const codes = Object.keys(choices);
        const savedRegion = shippingCountry === savedAddress.shippingCountry && savedAddress.shippingSubdivision;
        setRegions({
          country: shippingCountry,
          choices,
          selected: codes.includes(savedRegion) ? savedRegion : codes[0] || '',
          error: '',
        });
      } catch {
        if (active) setRegions({ country: shippingCountry, choices: {}, selected: '', error: 'Unable to load shipping regions. Please try again.' });
      }
    };

    loadRegions();
    return () => { active = false; };
  }, [shippingCountry, savedAddress]);

  const regionsCountry = regions && regions.country;
  const shippingSubdivision = regions ? regions.selected : '';
  const regionsError = regions && regions.error;

  useEffect(() => {
    let active = true;
    setOptions(null);
    if (!shippingCountry || regionsCountry !== shippingCountry || regionsError) return () => { active = false; };

    const loadOptions = async () => {
      try {
        const address = { country: shippingCountry };
        if (shippingSubdivision) address.region = shippingSubdivision;
        const choices = await commerce.checkout.getShippingOptions(checkoutToken.id, address);
        if (!active) return;
        const savedOption = shippingCountry === savedAddress.shippingCountry
          && shippingSubdivision === (savedAddress.shippingSubdivision || '')
          && savedAddress.shippingOption;
        setOptions({
          country: shippingCountry,
          region: shippingSubdivision,
          choices,
          selected: choices.some((option) => option.id === savedOption) ? savedOption : (choices[0] && choices[0].id) || '',
          error: choices.length ? '' : 'No shipping options are available for this address.',
        });
      } catch {
        if (active) setOptions({ country: shippingCountry, region: shippingSubdivision, choices: [], selected: '', error: 'Unable to load shipping options. Please try again.' });
      }
    };

    loadOptions();
    return () => { active = false; };
  }, [checkoutToken.id, shippingCountry, shippingSubdivision, regionsCountry, regionsError, savedAddress]);

  const regionsCurrent = regions && regions.country === shippingCountry;
  const optionsCurrent = options && options.country === shippingCountry && options.region === shippingSubdivision;
  const ready = !countries.loading && !!countries.choices[shippingCountry] && regionsCurrent && !regions.error
    && optionsCurrent && options.choices.some((option) => option.id === options.selected);
  const loading = countries.loading || (shippingCountry && (!regionsCurrent || (!regions.error && !optionsCurrent)));
  const shippingError = countries.error || (regionsCurrent && regions.error) || (optionsCurrent && options.error);

  return (
    <>
      <Typography variant="h6" gutterBottom>Shipping address</Typography>
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(async (data) => {
          if (ready && !submitting) {
            await onSubmit({ ...data, shippingCountry, shippingSubdivision, shippingOption: options.selected });
          }
        })}>
          <Grid container spacing={3}>
            <FormInput required name="firstName" label="First name" disabled={submitting} />
            <FormInput required name="lastName" label="Last name" disabled={submitting} />
            <FormInput required name="address1" label="Address line 1" disabled={submitting} />
            <FormInput required name="email" label="Email" type="email" disabled={submitting} />
            <FormInput required name="city" label="City" disabled={submitting} />
            <FormInput required name="zip" label="Zip / Postal code" disabled={submitting} />
            <Grid item xs={12} sm={6}>
              <InputLabel id="shipping-country-label">Shipping Country</InputLabel>
              <Select labelId="shipping-country-label" id="shipping-country" value={shippingCountry} fullWidth disabled={countries.loading || submitting} onChange={(event) => {
                setShippingCountry(event.target.value);
                setRegions(null);
                setOptions(null);
              }}>
                {Object.entries(countries.choices).map(([code, name]) => (
                  <MenuItem key={code} value={code}>{name}</MenuItem>
                ))}
              </Select>
            </Grid>
            {regionsCurrent && Object.keys(regions.choices).length > 0 && (
              <Grid item xs={12} sm={6}>
                <InputLabel id="shipping-region-label">Shipping Subdivision</InputLabel>
                <Select labelId="shipping-region-label" id="shipping-region" value={shippingSubdivision} fullWidth disabled={submitting} onChange={(event) => {
                  setRegions({ ...regions, selected: event.target.value });
                  setOptions(null);
                }}>
                  {Object.entries(regions.choices).map(([code, name]) => (
                    <MenuItem key={code} value={code}>{name}</MenuItem>
                  ))}
                </Select>
              </Grid>
            )}
            <Grid item xs={12} sm={6}>
              <InputLabel id="shipping-option-label">Shipping Options</InputLabel>
              <Select labelId="shipping-option-label" id="shipping-option" value={optionsCurrent ? options.selected : ''} fullWidth disabled={!ready || submitting} onChange={(event) => setOptions({ ...options, selected: event.target.value })}>
                {(optionsCurrent ? options.choices : []).map((option) => (
                  <MenuItem key={option.id} value={option.id}>{option.description} - ({option.price.formatted_with_symbol})</MenuItem>
                ))}
              </Select>
            </Grid>
          </Grid>
          {loading && <Typography role="status">Loading shipping options…</Typography>}
          {(shippingError || error) && <Typography role="alert" color="error">{shippingError || error}</Typography>}
          {shippingError && <Button type="button" onClick={() => setRetryCount((count) => count + 1)} disabled={submitting}>Retry shipping</Button>}
          <br />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button component={Link} variant="outlined" to="/cart" disabled={submitting}>Back to Cart</Button>
            <Button type="submit" variant="contained" color="primary" disabled={!ready || submitting}>{submitting ? 'Updating total…' : 'Next'}</Button>
          </div>
        </form>
      </FormProvider>
    </>
  );
};
export default AddressForm;
