import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export function RecordTable<T>({
  columns,
  rows,
  empty,
  rowKey,
}: {
  columns: { header: string; cell: (row: T) => React.ReactNode; className?: string }[]
  rows: T[]
  empty: string
  rowKey: (row: T, index: number) => string
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column, index) => <TableHead key={`${column.header}-${index}`}>{column.header}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={rowKey(row, index)}>
                {columns.map((column, columnIndex) => <TableCell key={`${column.header}-${columnIndex}`} className={column.className}>{column.cell(row)}</TableCell>)}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-muted-foreground">{empty}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}
