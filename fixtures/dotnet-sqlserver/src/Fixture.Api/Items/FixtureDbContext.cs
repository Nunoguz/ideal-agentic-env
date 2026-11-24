using Microsoft.EntityFrameworkCore;

namespace Fixture.Api.Items;

/// <summary>The fixture's database.</summary>
public sealed class FixtureDbContext(DbContextOptions<FixtureDbContext> options) : DbContext(options)
{
    public DbSet<Item> Items => Set<Item>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Item>(e =>
        {
            e.Property(i => i.Name).HasMaxLength(120);
            e.HasIndex(i => i.Name);
        });
    }
}
