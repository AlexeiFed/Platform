import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tokens } from "@/lib/design-tokens";
import { Images } from "lucide-react";

type PhotoRow = { url: string; position: number };

type Props = {
  beforePhotos: PhotoRow[];
  afterPhotos: PhotoRow[];
};

export const HomeworkStudentProgressPhotos = ({ beforePhotos, afterPhotos }: Props) => {
  if (beforePhotos.length === 0 && afterPhotos.length === 0) return null;

  return (
    <section className="min-w-0 space-y-3" aria-labelledby="homework-student-photos-heading">
      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle
            id="homework-student-photos-heading"
            className="flex items-center gap-2 text-base"
          >
            <Images className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>Фото из профиля (до / после)</span>
          </CardTitle>
          <p className={tokens.typography.small}>
            Снимки из раздела профиля студента; показываются, если загружены.
          </p>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <PhotoColumn label="До" photos={beforePhotos} />
          <PhotoColumn label="После" photos={afterPhotos} />
        </CardContent>
      </Card>
    </section>
  );
};

const PhotoColumn = ({ label, photos }: { label: string; photos: PhotoRow[] }) => (
  <div className="min-w-0 space-y-2">
    <div className={`${tokens.typography.label} text-muted-foreground`}>{label}</div>
    {photos.length === 0 ? (
      <p className={tokens.typography.small}>Нет фото</p>
    ) : (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
        {photos.map((p) => (
          <a
            key={`${p.url}-${p.position}`}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`relative aspect-[3/4] overflow-hidden border bg-muted ${tokens.radius.md}`}
          >
            <Image src={p.url} alt="" fill className="object-cover" sizes="(max-width: 640px) 45vw, 200px" />
          </a>
        ))}
      </div>
    )}
  </div>
);
