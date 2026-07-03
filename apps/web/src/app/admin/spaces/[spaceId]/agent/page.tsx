"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSpaceConfig } from "../space-config";

const REASONING_OPTIONS = [
  { value: "provider-default", label: "provider default" },
  { value: "none", label: "none" },
  { value: "minimal", label: "minimal" },
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "xhigh", label: "xhigh" },
] as const;

export default function SpaceAgentPage() {
  const {
    modelId,
    setModelId,
    reasoning,
    setReasoning,
    maxSteps,
    setMaxSteps,
    instructions,
    setInstructions,
    save,
    busy,
  } = useSpaceConfig();

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Agent config</CardTitle>
        <CardDescription>Saving changes creates a new active Space config version.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="model">Model</Label>
          <Input id="model" value={modelId} onChange={(e) => setModelId(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="reasoning">Reasoning</Label>
            <Select value={reasoning} onValueChange={(value) => value && setReasoning(value)}>
              <SelectTrigger id="reasoning" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="max-steps">Max steps</Label>
            <Input
              id="max-steps"
              type="number"
              min={1}
              max={40}
              value={maxSteps}
              onChange={(e) => setMaxSteps(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="instructions">Instructions</Label>
          <Textarea
            id="instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={12}
          />
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={save} disabled={busy}>
          Save new config version
        </Button>
      </CardFooter>
    </Card>
  );
}
