# Entrivo P10-G Analytics Definitions

## Wait Time
Wait time is measured in minutes for each checked-in visit:

`CheckIn.meetingStartedAt` if present, otherwise `CheckIn.hostNotifiedAt`, otherwise the latest approved `Approval.approvedAt` for the invitation.

Formula:

`max(0, readyTimestamp - CheckIn.checkInTime) / 60000`

The average is the arithmetic mean of valid visit wait times. The p90 is the nearest-rank 90th percentile. A missing ready timestamp is excluded rather than converted to zero.

## No-Show Rate
A past-scheduled invitation is a no-show when:
- The scheduled date is before the reporting end;
- Its status is not `CANCELLED`, `REJECTED`, or `EXPIRED`;
- It has no check-in;
- The scheduled date is not an organization/branch holiday, including recurring and date-range holidays.

No-show rate is the count of excluded no-show invitations divided by scheduled eligible invitations. Cancelled/rejected/expired visits and holiday dates are excluded.

## Visit Duration
Visit duration uses `CheckOut.durationMinutes`, calculated from checkout time minus check-in time.

The overstay threshold is `maxVisitDurationHours * 60` minutes from the organization policy. Overstay rate is checked-out visits above the threshold divided by checked-out visits with a duration.

## Approval Turnaround
Approval turnaround is:

`Approval.approvedAt - Approval.createdAt`

Only decisions with an approved timestamp inside the reporting range are included. The metric is the arithmetic mean in minutes.

## NPS
- Promoter: score 9–10
- Passive: score 7–8
- Detractor: score 0–6

`NPS = round(((promoters - detractors) / responses) * 100)`

An empty response set returns `0`. Comparison values use the immediately preceding equal-length period.

## Host Load
Visitors per host is the number of check-ins hosted during the reporting period. Concurrent visitors is the number of current `CHECKED_IN` records assigned to that host. A host is above threshold when concurrent visitors exceeds `feedbackHostLoadThreshold`.

## Peak Hours and Busiest Days
Peak-hours buckets count check-ins by JavaScript weekday index and check-in hour. Busiest days aggregate the same weekday buckets and sort descending.
