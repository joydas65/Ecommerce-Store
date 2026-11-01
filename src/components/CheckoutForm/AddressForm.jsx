'use client';

import { useState, useEffect } from 'react';
import { InputLabel, Select, MenuItem, Button, Grid, Typography } from '@mui/material';
import { useForm, FormProvider } from 'react-hook-form';
import Link from 'next/link';

import { commerce } from '../../lib/commerce';
import FormInput from './CustomTextField';
import { isDemoMode } from '../../lib/commerce-mode';

const AddressForm = ({ checkoutToken, shippingData = {}, onSubmit, isSubmitting = false, error = '' }) => {
  const [savedAddress, setSavedAddress] = useState(shippingData);
  const [countries, setCountries] = useState({ requestKey: null, choices: {}, error: '' });
  const [shippingCountry, setShippingCountry] = useState('');
  const [regions, setRegions] = useState(null);
  const [options, setOptions] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const methods = useForm({
    defaultValues: { firstName: '', lastName: '', address1: '', email: '', city: '', zip: '', ...shippingData },
  });
  const submitting = isSubmitting || methods.formState.isSubmitting;
  const countriesRequestKey = `${checkoutToken.id}:${retryCount}`;
  const countriesCurrent = countries.requestKey === countriesRequestKey;
  const countriesLoading = !countriesCurrent;
  const regionsRequestKey = `${countriesRequestKey}:${shippingCountry}`;

  useEffect(() => {
    let active = true;

    const loadCountries = async () => {
      try {
        const { countries: choices } = await commerce.services.localeListShippingCountries(checkoutToken.id);
        if (!active) return;
        const codes = Object.keys(choices);
        setCountries({ requestKey: countriesRequestKey, choices, error: codes.length ? '' : 'No shipping destinations are available.' });
        setShippingCountry(codes.includes(savedAddress.shippingCountry) ? savedAddress.shippingCountry : codes[0] || '');
      } catch {
        if (active) {
          setCountries({ requestKey: countriesRequestKey, choices: {}, error: 'Unable to load shipping countries. Please try again.' });
          setShippingCountry('');
        }
      }
    };

    loadCountries();
    return () => { active = false; };
  }, [checkoutToken.id, savedAddress, countriesRequestKey]);

  useEffect(() => {
    let active = true;
    if (!countriesCurrent || !shippingCountry) return () => { active = false; };

    const loadRegions = async () => {
      try {
        const { subdivisions: choices } = await commerce.services.localeListSubdivisions(shippingCountry);
        if (!active) return;
        const codes = Object.keys(choices);
        const savedRegion = shippingCountry === savedAddress.shippingCountry && savedAddress.shippingSubdivision;
        setRegions({
          requestKey: regionsRequestKey,
          country: shippingCountry,
          choices,
          selected: codes.includes(savedRegion) ? savedRegion : codes[0] || '',
          error: '',
        });
      } catch {
        if (active) setRegions({ requestKey: regionsRequestKey, country: shippingCountry, choices: {}, selected: '', error: 'Unable to load shipping regions. Please try again.' });
      }
    };

    loadRegions();
    return () => { active = false; };
  }, [shippingCountry, savedAddress, regionsRequestKey, countriesCurrent]);

  const regionsCurrent = regions?.requestKey === regionsRequestKey;
  const shippingSubdivision = regionsCurrent ? regions.selected : '';
  const regionsError = regionsCurrent && regions.error;
  const optionsRequestKey = `${regionsRequestKey}:${shippingSubdivision}`;

  useEffect(() => {
    let active = true;
    if (!countriesCurrent || !shippingCountry || !regionsCurrent || regionsError) return () => { active = false; };

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
          requestKey: optionsRequestKey,
          country: shippingCountry,
          region: shippingSubdivision,
          choices,
          selected: choices.some((option) => option.id === savedOption) ? savedOption : (choices[0] && choices[0].id) || '',
          error: choices.length ? '' : 'No shipping options are available for this address.',
        });
      } catch {
        if (active) setOptions({ requestKey: optionsRequestKey, country: shippingCountry, region: shippingSubdivision, choices: [], selected: '', error: 'Unable to load shipping options. Please try again.' });
      }
    };

    loadOptions();
    return () => { active = false; };
  }, [checkoutToken.id, shippingCountry, shippingSubdivision, regionsCurrent, regionsError, savedAddress, countriesCurrent, optionsRequestKey]);

  const optionsCurrent = options?.requestKey === optionsRequestKey;
  const ready = !countriesLoading && !!countries.choices[shippingCountry] && regionsCurrent && !regions.error
    && optionsCurrent && options.choices.some((option) => option.id === options.selected);
  const loading = countriesLoading || (shippingCountry && (!regionsCurrent || (!regions.error && !optionsCurrent)));
  const shippingError = (countriesCurrent && countries.error) || (regionsCurrent && regions.error) || (optionsCurrent && options.error);

  return (
    <>
      <Typography variant="h6" gutterBottom>Shipping address</Typography>
      {isDemoMode && (
        <>
          <Typography variant="body2" color="text.secondary">Use fictitious details for this demo. Your address is used only for this checkout and is not saved.</Typography>
          <Button type="button" disabled={submitting || countriesLoading} sx={{ my: 1 }} onClick={() => {
            const sampleAddress = {
              firstName: 'Alex', lastName: 'Morgan', email: 'demo@example.com', address1: '123 Demo Street', city: 'San Francisco', zip: '94105',
              shippingCountry: 'US', shippingSubdivision: 'CA',
            };
            methods.reset(sampleAddress);
            // Lookups must restore the newly selected sample destination,
            // including when a previous address used another US region.
            setSavedAddress(sampleAddress);
            setShippingCountry('US');
            setRegions(null);
            setOptions(null);
          }}>Use sample address</Button>
        </>
      )}
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
            <Grid size={{ xs: 12, sm: 6 }}>
              <InputLabel id="shipping-country-label">Shipping Country</InputLabel>
              <Select labelId="shipping-country-label" id="shipping-country" value={shippingCountry} fullWidth disabled={countriesLoading || submitting} onChange={(event) => {
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
              <Grid size={{ xs: 12, sm: 6 }}>
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
            <Grid size={{ xs: 12, sm: 6 }}>
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
            <Button component={Link} variant="outlined" href="/cart" disabled={submitting}>Back to Cart</Button>
            <Button type="submit" variant="contained" color="primary" disabled={!ready || submitting}>{submitting ? 'Updating total…' : 'Next'}</Button>
          </div>
        </form>
      </FormProvider>
    </>
  );
};
export default AddressForm;
