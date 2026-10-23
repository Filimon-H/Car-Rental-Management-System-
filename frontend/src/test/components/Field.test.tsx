import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Field, SelectField, TextareaField } from '@/components/ui/Field'

describe('Field', () => {
  it('associates the label with the control', () => {
    render(<Field label="Primary Phone" />)
    // getByLabelText only resolves through a real label association, so this
    // fails for the sibling label/input markup these fields replaced.
    expect(screen.getByLabelText('Primary Phone')).toBeInTheDocument()
  })

  it('gives each instance its own id so repeated fields stay distinct', () => {
    render(
      <>
        <Field label="Primary Phone" />
        <Field label="Secondary Phone" />
      </>
    )
    const first = screen.getByLabelText('Primary Phone')
    const second = screen.getByLabelText('Secondary Phone')
    expect(first.id).toBeTruthy()
    expect(first.id).not.toBe(second.id)
  })

  it('marks an errored control invalid and points at the message', () => {
    render(<Field label="Email" error="value is not a valid email address" />)
    const input = screen.getByLabelText('Email')

    expect(input).toHaveAttribute('aria-invalid', 'true')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      'value is not a valid email address'
    )
  })

  it('is not marked invalid when there is no error', () => {
    render(<Field label="City" />)
    expect(screen.getByLabelText('City')).not.toHaveAttribute('aria-invalid')
  })

  it('describes the control with its hint', () => {
    render(<Field label="Commission Rate (%)" hint="Defaults to 70%." />)
    const input = screen.getByLabelText('Commission Rate (%)')
    const describedBy = input.getAttribute('aria-describedby')
    expect(document.getElementById(describedBy as string)).toHaveTextContent('Defaults to 70%.')
  })

  it('shows the error instead of the hint when both are supplied', () => {
    render(<Field label="Rate" hint="Defaults to 70%." error="Must be 0-100" />)
    expect(screen.getByText('Must be 0-100')).toBeInTheDocument()
    expect(screen.queryByText('Defaults to 70%.')).not.toBeInTheDocument()
  })

  it('keeps a hidden label reachable by assistive tech', () => {
    render(<Field label="Search vendors" hideLabel />)
    expect(screen.getByLabelText('Search vendors')).toBeInTheDocument()
  })

  it('labels selects and textareas the same way', () => {
    render(
      <>
        <SelectField label="Type">
          <option value="company">Company</option>
        </SelectField>
        <TextareaField label="Notes" />
      </>
    )
    expect(screen.getByLabelText('Type').tagName).toBe('SELECT')
    expect(screen.getByLabelText('Notes').tagName).toBe('TEXTAREA')
  })

  it('forwards native attributes to the control', () => {
    render(<Field label="Commission" type="number" min={0} max={100} required />)
    const input = screen.getByLabelText(/Commission/)
    expect(input).toHaveAttribute('type', 'number')
    expect(input).toHaveAttribute('min', '0')
    expect(input).toHaveAttribute('max', '100')
    expect(input).toBeRequired()
  })
})
