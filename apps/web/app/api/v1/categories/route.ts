import { db } from "@/lib/db";
import { errorResponse, jsonCached } from "@/lib/http";

export async function GET() {
  try {
    const categories = await db.category.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { skills: { where: { status: "ACTIVE" } } } } },
    });
    return jsonCached({
      data: categories.map((category) => ({
        slug: category.slug,
        name: category.name,
        description: category.description,
        icon: category.icon,
        skillCount: category._count.skills,
      })),
    }, 60);
  } catch (error) {
    return errorResponse(error);
  }
}
