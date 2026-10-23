import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable, type Column } from '@/components/ui/DataTable'

interface Row {
  id: number
  name: string
  city: string
}

const rows: Row[] = [
  { id: 1, name: 'Abebe Bekele', city: 'Addis Ababa' },
  { id: 2, name: 'Zenebech Tesfaye', city: 'Bahir Dar' },
]

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', cell: (row) => row.name },
  { key: 'city', header: 'City', cell: (row) => row.city },
]

describe('DataTable', () => {
  it('renders a row per record', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />)

    expect(screen.getByText('Abebe Bekele')).toBeInTheDocument()
    expect(screen.getByText('Bahir Dar')).toBeInTheDocument()
  })

  it('shows column headers as real table headers', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />)

    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'City' })).toBeInTheDocument()
  })

  describe('state precedence', () => {
    it('shows the error state instead of rows when loading fails', () => {
      render(
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          error={new Error('boom')}
          errorMessage="Could not load people"
        />
      )

      expect(screen.getByText('Could not load people')).toBeInTheDocument()
      expect(screen.queryByText('Abebe Bekele')).not.toBeInTheDocument()
    })

    it('error wins over loading', () => {
      render(
        <DataTable
          columns={columns}
          rows={undefined}
          rowKey={(r) => r.id}
          isLoading
          error={new Error('boom')}
          errorMessage="Could not load people"
        />
      )

      expect(screen.getByText('Could not load people')).toBeInTheDocument()
    })

    it('shows the empty state only when there is no error and nothing is loading', () => {
      render(
        <DataTable
          columns={columns}
          rows={[]}
          rowKey={(r) => r.id}
          emptyTitle="No people yet"
          emptyMessage="Add someone to begin."
        />
      )

      expect(screen.getByText('No people yet')).toBeInTheDocument()
      expect(screen.getByText('Add someone to begin.')).toBeInTheDocument()
    })

    it('does not claim emptiness while still loading', () => {
      render(
        <DataTable
          columns={columns}
          rows={undefined}
          rowKey={(r) => r.id}
          isLoading
          emptyTitle="No people yet"
        />
      )

      expect(screen.queryByText('No people yet')).not.toBeInTheDocument()
    })
  })

  describe('row interaction', () => {
    it('calls onRowClick with the clicked row', async () => {
      const onRowClick = vi.fn()
      render(
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} />
      )

      await userEvent.click(screen.getByText('Abebe Bekele'))

      expect(onRowClick).toHaveBeenCalledWith(rows[0])
    })

    it('activates a row from the keyboard', async () => {
      const onRowClick = vi.fn()
      render(
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} />
      )

      await userEvent.tab()
      await userEvent.keyboard('{Enter}')

      expect(onRowClick).toHaveBeenCalledWith(rows[0])
    })

    it('activates a row with Space', async () => {
      const onRowClick = vi.fn()
      render(
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} />
      )

      await userEvent.tab()
      await userEvent.keyboard(' ')

      expect(onRowClick).toHaveBeenCalledWith(rows[0])
    })

    it('leaves rows out of the tab order when they are not clickable', () => {
      render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />)

      expect(screen.queryAllByRole('button')).toHaveLength(0)
    })
  })

  it('exposes the caption to assistive tech', () => {
    render(
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption="People" />
    )

    expect(screen.getByRole('table', { name: 'People' })).toBeInTheDocument()
  })
})
