import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MarketerTarget } from "@/hooks/useMarketerTarget";
import { AlertCircle, Calendar, Target, TrendingUp } from "lucide-react";

interface TodaySummaryProps {
  greeting: string;
  followUpsToday: number;
  urgentCount: number;
  upcomingCount: number;
  target?: MarketerTarget | null;
}

export function TodaySummary({
  greeting,
  followUpsToday,
  urgentCount,
  upcomingCount,
  target,
}: TodaySummaryProps) {
  const achievementRate = target ? Math.min((target.current_progress / target.target_amount) * 100, 100) : 0;
  const isBehind = target && target.current_progress < target.target_amount;

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-bold">{greeting}</h2>
        <p className="text-muted-foreground mt-1">Here's what's on your plate today</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{followUpsToday}</p>
                <p className="text-xs text-muted-foreground">Today's Follow-ups</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{urgentCount}</p>
                <p className="text-xs text-muted-foreground">Urgent</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-100 rounded-lg">
                <TrendingUp className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{upcomingCount}</p>
                <p className="text-xs text-muted-foreground">This Week</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <Target className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {target ? `${achievementRate.toFixed(0)}%` : '—'}
                </p>
                <p className="text-xs text-muted-foreground">Target Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Target Progress */}
      {target && (
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm font-medium">Monthly Target</p>
              <p className="text-sm text-muted-foreground">
                {target.current_progress} / {target.target_amount} {target.target_type === 'units' ? 'units' : '₹'}
              </p>
            </div>
            <Progress value={achievementRate} className="h-2" />
            {isBehind && (
              <p className="text-xs text-amber-600 mt-2">
                Behind pace by {target.target_amount - target.current_progress} {target.target_type === 'units' ? 'units' : '₹'}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
