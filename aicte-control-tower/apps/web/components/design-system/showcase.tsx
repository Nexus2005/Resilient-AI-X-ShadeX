"use client";

import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/domain/data-table";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { StatusLabel } from "@/components/domain/status-label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DemoApplication = {
  id: string;
  institution: string;
  stage: string;
  age: number;
  state: "on_track" | "at_risk" | "overdue";
};

const demoRows: DemoApplication[] = [
  { id: "A1", institution: "Axis Institute of Technology", stage: "EVC queue", age: 3, state: "on_track" },
  { id: "A2", institution: "Sunrise College of Engineering", stage: "Scrutiny", age: 6, state: "at_risk" },
  { id: "A3", institution: "Nalanda Institute of Management", stage: "Re-scrutiny", age: 8, state: "overdue" },
  { id: "A4", institution: "Coastal Polytechnic", stage: "Approval", age: 2, state: "on_track" },
];

const columns: Column<DemoApplication>[] = [
  {
    key: "institution",
    header: "Institution",
    render: (row) => row.institution,
    sortValue: (row) => row.institution,
  },
  { key: "stage", header: "Stage", render: (row) => row.stage, sortValue: (row) => row.stage },
  {
    key: "age",
    header: "Days in stage",
    align: "right",
    render: (row) => `${row.age}`,
    sortValue: (row) => row.age,
  },
  {
    key: "state",
    header: "State",
    render: (row) => <StatusLabel state={row.state} />,
    sortValue: (row) => row.state,
  },
];

export function Showcase() {
  const [metric, setMetric] = useState<"applications" | "overdue">("applications");

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-[20px] font-semibold leading-7">Tabs</h2>
        <Tabs defaultValue="documents" className="mt-4">
          <TabsList>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="deficiencies">Deficiencies</TabsTrigger>
            <TabsTrigger value="obligations">Obligations</TabsTrigger>
          </TabsList>
          <TabsContent value="documents" className="mt-4 text-[14px] text-muted">
            Four documents attached. Two dates confirmed by the institution.
          </TabsContent>
          <TabsContent value="deficiencies" className="mt-4 text-[14px] text-muted">
            One open revert: fire NOC required before resubmission.
          </TabsContent>
          <TabsContent value="obligations" className="mt-4 text-[14px] text-muted">
            Two undertakings created at approval. None verified yet.
          </TabsContent>
        </Tabs>
      </section>

      <section>
        <h2 className="text-[20px] font-semibold leading-7">Overlays</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>Open signed action</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Revert to institution</DialogTitle>
                <DialogDescription>
                  This decision is recorded under your name and appended to the
                  audit trail.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reason">Reason</Label>
                <Input id="reason" placeholder="Fire NOC is missing" />
              </div>
              <DialogFooter>
                <Button variant="outline">Cancel</Button>
                <Button>Sign and record</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Sheet>
            <SheetTrigger render={<Button variant="outline" />}>Open side sheet</SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Assign EVC panel</SheetTitle>
                <SheetDescription>
                  Conflicted experts are rejected with a reason before a visit can
                  be scheduled.
                </SheetDescription>
              </SheetHeader>
              <div className="px-6 py-4 text-[14px] leading-6 text-muted">
                Pick experts, then confirm the visit date. Conflict checks run on
                the server, not in the browser.
              </div>
            </SheetContent>
          </Sheet>

          <Button
            variant="outline"
            onClick={() => toast.success("Preferences saved")}
          >
            Show success toast
          </Button>
          <Button
            variant="outline"
            onClick={() => toast.error("That file type is not accepted. Upload a PDF.")}
          >
            Show error toast
          </Button>
        </div>
      </section>

      <section>
        <h2 className="text-[20px] font-semibold leading-7">Segmented control</h2>
        <SegmentedControl
          ariaLabel="Map metric"
          value={metric}
          onChange={setMetric}
          className="mt-4"
          options={[
            { label: "Applications", value: "applications" },
            { label: "Past deadline", value: "overdue" },
          ]}
        />
        <p className="mt-3 text-[13px] text-muted">
          Selected metric: {metric === "applications" ? "Applications" : "Past deadline"}.
        </p>
      </section>

      <section>
        <h2 className="text-[20px] font-semibold leading-7">Data table</h2>
        <p className="mt-1 text-[13px] text-muted">
          Sortable, paginated and with an empty state.
        </p>
        <div className="mt-4">
          <DataTable
            caption="Demonstration applications"
            columns={columns}
            rows={demoRows}
            getRowId={(row) => row.id}
            pageSize={3}
            emptyTitle="No applications yet"
            emptyDescription="Applications appear here once an institution submits one."
            emptyAction={<Button size="sm">Create application</Button>}
          />
        </div>
      </section>
    </div>
  );
}
